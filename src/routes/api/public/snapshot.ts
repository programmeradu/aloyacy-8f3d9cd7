// Public ingestion endpoint — pulls a snapshot from the live GTFS-RT feed
// and persists it for the learning pipeline. Safe to call from a cron job
// every 1-2 minutes. No PII, no writes outside transit data.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fetchRealtime } from "@/lib/gtfs-rt.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, X-Cron-Secret",
};

// No query params expected. Strict reject keeps the surface tiny.
const QuerySchema = z.object({}).strict();

function badRequest(message: string) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function guard(request: Request): Promise<Response | null> {
  const apikey = request.headers.get("apikey");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let legacySecret: string | null = process.env.CRON_SECRET ?? null;
  try {
    const { data } = await supabase
      .schema("vault" as never)
      .from("decrypted_secrets" as never)
      .select("decrypted_secret")
      .eq("name", "aloya_cron_secret")
      .maybeSingle();
    legacySecret = (data as { decrypted_secret?: string } | null)?.decrypted_secret ?? legacySecret;
  } catch {
    // ignore vault lookup failures and fall back to env
  }
  const legacyHeader =
    request.headers.get("X-Cron-Secret") ?? request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("cron_secret");
  const validApiKey = apikey && (apikey === (import.meta.env.VITE_CUSTOM_SUPABASE_ANON_KEY || process.env.CUSTOM_SUPABASE_ANON_KEY) || apikey === import.meta.env.VITE_CUSTOM_SUPABASE_ANON_KEY);
  const validCron = bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
  const validLegacy = legacySecret && legacyHeader && legacyHeader === legacySecret;
  if (!validApiKey && !validCron && !validLegacy) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const url = new URL(request.url);
  const params = Object.fromEntries(
    [...url.searchParams.entries()].filter(([k]) => k !== "cron_secret"),
  );
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return badRequest("Unexpected query parameters.");
  return null;
}

export const Route = createFileRoute("/api/public/snapshot")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

async function ingest() {
  try {
    const snap = await fetchRealtime();
    if (snap.arrivals.length === 0) {
      return json({ ok: true, inserted: 0, stats_updated: 0 });
    }

    // Take only arrivals predicted within the next 90 minutes — keeps the
    // table from ballooning with far-future stale predictions.
    const cutoff = snap.fetchedAt + 90 * 60;
    const fresh = snap.arrivals.filter(
      (a) =>
        a.arrivalUnix >= snap.fetchedAt - 60 &&
        a.arrivalUnix <= cutoff &&
        a.routeId &&
        a.stopId &&
        a.tripId,
    );

    const rows = fresh.map((a) => ({
      route_id: a.routeId,
      stop_id: a.stopId,
      trip_id: a.tripId,
      predicted_arrival: new Date(a.arrivalUnix * 1000).toISOString(),
      delay_sec: a.delaySec,
    }));

    // Update observed_arrivals (last known prediction per trip+stop)
    const observedMap = new Map<string, typeof fresh[number]>();
    for (const a of fresh) {
      const key = `${a.tripId}|${a.stopId}`;
      const prev = observedMap.get(key);
      if (!prev || a.arrivalUnix > prev.arrivalUnix) observedMap.set(key, a);
    }
    const observed = [...observedMap.values()].map((a) => ({
      trip_id: a.tripId,
      stop_id: a.stopId,
      route_id: a.routeId,
      last_predicted_arrival: new Date(a.arrivalUnix * 1000).toISOString(),
      last_delay_sec: a.delaySec,
      last_seen_at: new Date(snap.fetchedAt * 1000).toISOString(),
    }));

    // Incrementally update delay_stats per (route, stop, hour, dow).
    const buckets = new Map<
      string,
      { route_id: string; stop_id: string; hour_of_day: number; day_of_week: number; sum: number; count: number }
    >();
    for (const a of fresh) {
      const d = new Date(a.arrivalUnix * 1000);
      const hour = d.getUTCHours();
      const dow = d.getUTCDay();
      const key = `${a.routeId}|${a.stopId}|${hour}|${dow}`;
      const b = buckets.get(key) ?? {
        route_id: a.routeId,
        stop_id: a.stopId,
        hour_of_day: hour,
        day_of_week: dow,
        sum: 0,
        count: 0,
      };
      b.sum += a.delaySec;
      b.count += 1;
      buckets.set(key, b);
    }

    const bucketArray = Array.from(buckets.values());
    const CHUNK_SIZE = 50;
    const upserts = [];

    for (let i = 0; i < bucketArray.length; i += CHUNK_SIZE) {
      const chunk = bucketArray.slice(i, i + CHUNK_SIZE);
      const orFilter = chunk
        .map((b) => `and(route_id.eq.${b.route_id},stop_id.eq.${b.stop_id},hour_of_day.eq.${b.hour_of_day},day_of_week.eq.${b.day_of_week})`)
        .join(',');

      const { data: existingRecords } = await supabase
        .from("delay_stats")
        .select("route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count")
        .or(orFilter);

      const existingMap = new Map();
      for (const ex of (existingRecords || [])) {
        existingMap.set(`${ex.route_id}|${ex.stop_id}|${ex.hour_of_day}|${ex.day_of_week}`, ex);
      }

      for (const b of chunk) {
        const key = `${b.route_id}|${b.stop_id}|${b.hour_of_day}|${b.day_of_week}`;
        const existing = existingMap.get(key);
        const prevMean = existing?.mean_delay_sec ?? 0;
        const prevN = existing?.sample_count ?? 0;
        const newN = prevN + b.count;
        const newMean = (prevMean * prevN + b.sum) / newN;

        upserts.push({
          route_id: b.route_id,
          stop_id: b.stop_id,
          hour_of_day: b.hour_of_day,
          day_of_week: b.day_of_week,
          mean_delay_sec: newMean,
          sample_count: newN,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Call the RPC in small chunks. 500-row batches were tripping the
    // Postgres statement timeout; the three payloads are also independent
    // lists, so each one is paged on its own instead of sharing an index.
    const RPC_CHUNK_SIZE = 100;
    let inserted = 0;
    let statsUpdated = 0;

    const batches = Math.max(
      Math.ceil(rows.length / RPC_CHUNK_SIZE),
      Math.ceil(observed.length / RPC_CHUNK_SIZE),
      Math.ceil(upserts.length / RPC_CHUNK_SIZE),
    );

    for (let b = 0; b < batches; b++) {
      const i = b * RPC_CHUNK_SIZE;
      const chunkRows = rows.slice(i, i + RPC_CHUNK_SIZE);
      const chunkObserved = observed.slice(i, i + RPC_CHUNK_SIZE);
      const chunkStats = upserts.slice(i, i + RPC_CHUNK_SIZE);
      if (!chunkRows.length && !chunkObserved.length && !chunkStats.length) continue;


      // `ingest_gtfs_snapshots` is not present in the generated types for the
      // migrated project yet (see supabase/migrations/20260811000000_ingest_gtfs_rpc.sql).
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>)("ingest_gtfs_snapshots", {
        snapshots: chunkRows,
        observed: chunkObserved,
        stats: chunkStats,
      });
      
      if (error) {
        console.error("RPC ingest_gtfs_snapshots error", error);
      } else {
        inserted += chunkRows.length;
        statsUpdated += chunkStats.length;
      }
    }

    return json({ ok: true, inserted, stats_updated: statsUpdated });
  } catch (e) {
    console.error("snapshot ingest failed", e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "ingest failed" },
      502,
    );
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
