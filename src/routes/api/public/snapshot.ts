// Public ingestion endpoint — pulls a snapshot from the live GTFS-RT feed
// and persists it for the learning pipeline. Safe to call from a cron job
// every 1-2 minutes. No PII, no writes outside transit data.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchRealtime } from "@/lib/gtfs-rt.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Cron-Secret",
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
  // Accept the vault-managed scheduler secret first, then the env fallback.
  // This keeps the snapshot cron aligned with the existing scheduled job.
  let expected = process.env.CRON_SECRET ?? null;
  try {
    const { data } = await supabaseAdmin
      .schema("vault" as never)
      .from("decrypted_secrets" as never)
      .select("decrypted_secret")
      .eq("name", "aloya_cron_secret")
      .maybeSingle();
    const vaultSecret = (data as { decrypted_secret?: string } | null)?.decrypted_secret;
    if (vaultSecret) expected = vaultSecret;
  } catch {
    // ignore vault lookup failures and fall back to env
  }

  if (expected) {
    const url = new URL(request.url);
    const provided =
      request.headers.get("X-Cron-Secret") ?? request.headers.get("x-cron-secret") ?? url.searchParams.get("cron_secret");
    if (!provided || provided !== expected) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
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

    // Insert raw snapshots (chunked to be polite)
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin.from("rt_snapshots").insert(chunk);
      if (error) {
        console.error("rt_snapshots insert error", error);
      } else {
        inserted += chunk.length;
      }
    }

    // Update observed_arrivals (last known prediction per trip+stop)
    const observed = fresh.map((a) => ({
      trip_id: a.tripId,
      stop_id: a.stopId,
      route_id: a.routeId,
      last_predicted_arrival: new Date(a.arrivalUnix * 1000).toISOString(),
      last_delay_sec: a.delaySec,
      last_seen_at: new Date(snap.fetchedAt * 1000).toISOString(),
    }));
    for (let i = 0; i < observed.length; i += chunkSize) {
      const chunk = observed.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin
        .from("observed_arrivals")
        .upsert(chunk, { onConflict: "trip_id,stop_id" });
      if (error) console.error("observed_arrivals upsert", error);
    }

    // Incrementally update delay_stats per (route, stop, hour, dow).
    // Aggregate this batch first, then merge into the running average via RPC-less SQL.
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

    let statsUpdated = 0;
    // Merge each bucket via select-then-upsert with running mean.
    for (const b of buckets.values()) {
      const { data: existing } = await supabaseAdmin
        .from("delay_stats")
        .select("mean_delay_sec, sample_count")
        .eq("route_id", b.route_id)
        .eq("stop_id", b.stop_id)
        .eq("hour_of_day", b.hour_of_day)
        .eq("day_of_week", b.day_of_week)
        .maybeSingle();

      const prevMean = existing?.mean_delay_sec ?? 0;
      const prevN = existing?.sample_count ?? 0;
      const newN = prevN + b.count;
      const newMean = (prevMean * prevN + b.sum) / newN;

      const { error } = await supabaseAdmin.from("delay_stats").upsert(
        {
          route_id: b.route_id,
          stop_id: b.stop_id,
          hour_of_day: b.hour_of_day,
          day_of_week: b.day_of_week,
          mean_delay_sec: newMean,
          sample_count: newN,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "route_id,stop_id,hour_of_day,day_of_week" },
      );
      if (!error) statsUpdated++;
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
