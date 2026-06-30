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
    //
    // We send DELTAS (sum + count) and let Postgres merge the running mean
    // in the upsert. The previous version read the matching delay_stats rows
    // back first with a 50-way `or(and(...))` filter per chunk — on the
    // migrated database each of those reads took ~40s, so a single snapshot
    // needed well over ten minutes and the cron call always timed out before
    // writing anything. That is what silently killed every downstream feed.
    const buckets = new Map<
      string,
      { route_id: string; stop_id: string; hour_of_day: number; day_of_week: number; sum_delay_sec: number; count: number }
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
        sum_delay_sec: 0,
        count: 0,
      };
      b.sum_delay_sec += a.delaySec;
      b.count += 1;
      buckets.set(key, b);
    }
    const statDeltas = Array.from(buckets.values());

    // Chunked so no single statement runs long, but large enough that a full
    // snapshot finishes in a handful of round trips.
    const RPC_CHUNK_SIZE = 400;
    // Hard wall-clock budget — the caller is a cron worker on a 60s-ish
    // leash, so stop cleanly and report partial progress instead of hanging.
    const DEADLINE = Date.now() + 45_000;
    let inserted = 0;
    let statsUpdated = 0;
    let truncated = false;
    let lastError: string | null = null;
    let useV2 = true;

    const batches = Math.max(
      Math.ceil(rows.length / RPC_CHUNK_SIZE),
      Math.ceil(observed.length / RPC_CHUNK_SIZE),
      Math.ceil(statDeltas.length / RPC_CHUNK_SIZE),
    );

    // Bound: `supabase` is a lazy Proxy, so a detached `.rpc` reference
    // would lose its receiver and throw on the internal `this.rest` access.
    const rpc = (fn: string, args: Record<string, unknown>) =>
      (supabase.rpc as unknown as (
        f: string,
        a: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>).call(supabase, fn, args);

    for (let b = 0; b < batches; b++) {
      if (Date.now() > DEADLINE) {
        truncated = true;
        break;
      }
      const i = b * RPC_CHUNK_SIZE;
      const chunkRows = rows.slice(i, i + RPC_CHUNK_SIZE);
      const chunkObserved = observed.slice(i, i + RPC_CHUNK_SIZE);
      const chunkStats = statDeltas.slice(i, i + RPC_CHUNK_SIZE);
      if (!chunkRows.length && !chunkObserved.length && !chunkStats.length) continue;

      let error: { message: string } | null = null;

      if (useV2) {
        ({ error } = await rpc("ingest_gtfs_snapshots_v2", {
          snapshots: chunkRows,
          observed: chunkObserved,
          stats: chunkStats,
        }));
        // v2 lives in deploy/supabase/sql/20260821_ingest_v2_and_retention.sql.
        // Until that has been applied, fall back to the original RPC with the
        // stats payload omitted — arrivals and observed rows still land, which
        // keeps the live surfaces fed instead of writing nothing at all.
        if (error && /could not find the function|does not exist|PGRST202/i.test(error.message)) {
          useV2 = false;
          error = null;
        }
      }

      if (!useV2) {
        ({ error } = await rpc("ingest_gtfs_snapshots", {
          snapshots: chunkRows,
          observed: chunkObserved,
          stats: [],
        }));
      }

      if (error) {
        lastError = error.message;
        console.error("snapshot ingest RPC error", error);
      } else {
        inserted += chunkRows.length;
        if (useV2) statsUpdated += chunkStats.length;
      }
    }

    return json({
      ok: true,
      inserted,
      stats_updated: statsUpdated,
      stats_mode: useV2 ? "v2" : "skipped (apply 20260821_ingest_v2_and_retention.sql)",
      ...(truncated ? { truncated: true } : {}),
      ...(lastError ? { last_error: lastError } : {}),
    });

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
