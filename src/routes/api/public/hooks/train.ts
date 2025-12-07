// Training pipeline aggregator. Called by pg_cron every 15 min (fast loop)
// and at 03:10 UTC daily (full roll-up). Reads raw signals — rider GPS
// fixes, RT snapshots, active trips, training events — and updates the
// rollup tables the planner reads at request time.
//
// Auth: bypassed at /api/public/*; we additionally require the project's
// anon key in the `apikey` header (canonical cron pattern). All writes go
// through the service-role client.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey",
};

const QuerySchema = z.object({ mode: z.enum(["fast", "full"]).default("fast") });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function guard(request: Request) {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
  const provided = request.headers.get("apikey");
  if (expected && provided !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/train")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await runFromRequest(request)),
      POST: async ({ request }) => (await runFromRequest(request)),
    },
  },
});

async function runFromRequest(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const mode = QuerySchema.parse({ mode: url.searchParams.get("mode") ?? "fast" }).mode;

  const started = new Date();
  const stats: Record<string, number> = {};
  try {
    stats.segmentRuntimes = await rollupSegmentRuntimes();
    stats.dwell = await rollupDwellTimes();
    stats.feedTruth = await rollupFeedVsTruth();
    stats.crowding = await rollupCrowding();
    stats.headway = await rollupHeadways();
    stats.trainingEvents = await processTrainingEvents();
    if (mode === "full") {
      stats.noShows = await detectNoShows();
    }
    const ok = true;
    await supabaseAdmin.from("training_runs").insert({
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      stats,
      ok,
    });
    return json({ ok, mode, stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : "training failed";
    await supabaseAdmin.from("training_runs").insert({
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      stats: { ...stats, error: 1 },
      ok: false,
    });
    return json({ ok: false, mode, stats, error: message }, 500);
  }
}

// ---------- helpers ----------

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function blendStat<T extends Record<string, unknown>>(
  table: string,
  key: T,
  meanField: string,
  sample: { mean: number; count: number },
): Promise<void> {
  const filter = supabaseAdmin.from(table).select(`${meanField}, sample_count`);
  let q = filter;
  for (const [k, v] of Object.entries(key)) q = q.eq(k, v as never);
  const { data } = await q.maybeSingle();
  const prevMean = (data as Record<string, number> | null)?.[meanField] ?? 0;
  const prevN = (data as { sample_count?: number } | null)?.sample_count ?? 0;
  const newN = prevN + sample.count;
  if (newN === 0) return;
  const newMean = (prevMean * prevN + sample.mean * sample.count) / newN;
  await supabaseAdmin.from(table).upsert(
    {
      ...key,
      [meanField]: newMean,
      sample_count: newN,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: Object.keys(key).join(",") },
  );
}

// ---------- segment runtimes (rider GPS → stop-to-stop times) -------------
// Heuristic v1: per (trip_id) sort fixes, take total duration, distribute
// proportionally across the legs of the active itinerary recorded in
// active_trips. This is rough but real — actual end-to-end time is the
// strongest signal we have until we wire stop-snap.
async function rollupSegmentRuntimes(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: fixes } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, lat, lng, reported_at")
    .gte("reported_at", since)
    .order("trip_id")
    .order("reported_at")
    .limit(20000);
  if (!fixes || fixes.length < 2) return 0;

  const byTrip = new Map<string, typeof fixes>();
  for (const f of fixes) {
    const arr = byTrip.get(f.trip_id) ?? [];
    arr.push(f);
    byTrip.set(f.trip_id, arr);
  }

  let inserted = 0;
  for (const [tripId, arr] of byTrip) {
    if (arr.length < 4) continue;
    // Pull the rider's planned legs so we can attribute the trip span
    // across known board→alight pairs.
    const { data: at } = await supabaseAdmin
      .from("active_trips")
      .select("legs")
      .eq("trip_id", tripId)
      .maybeSingle();
    const legs = (at?.legs ?? []) as Array<{
      kind: string;
      routeId?: string;
      board?: { stopId: string };
      alight?: { stopId: string };
    }>;
    const ride = legs.find((l) => l.kind === "ride" && l.board && l.alight);
    if (!ride?.board || !ride?.alight) continue;
    const first = arr[0];
    const last = arr[arr.length - 1];
    const elapsedSec = (new Date(last.reported_at).getTime() - new Date(first.reported_at).getTime()) / 1000;
    if (elapsedSec < 30 || elapsedSec > 5400) continue;
    const d = new Date(first.reported_at);
    await blendStat(
      "segment_runtimes",
      {
        route_id: ride.routeId ?? first.route_id ?? "unknown",
        from_stop_id: ride.board.stopId,
        to_stop_id: ride.alight.stopId,
        hour_of_day: d.getUTCHours(),
        day_of_week: d.getUTCDay(),
      },
      "mean_runtime_sec",
      { mean: elapsedSec, count: 1 },
    );
    inserted++;
  }
  return inserted;
}

// ---------- dwell times (rider speed ≈ 0) ---------------------------------
async function rollupDwellTimes(): Promise<number> {
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: fixes } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, lat, lng, speed_mps, reported_at")
    .gte("reported_at", since)
    .not("speed_mps", "is", null)
    .lte("speed_mps", 0.8)
    .order("trip_id")
    .order("reported_at")
    .limit(20000);
  if (!fixes || fixes.length < 2) return 0;

  // Group consecutive low-speed fixes per trip into dwell windows.
  const dwells: Array<{ route: string; trip: string; lat: number; lng: number; sec: number; at: string }> = [];
  let cur: typeof fixes[number] | null = null;
  let curStart: number | null = null;
  let curTrip: string | null = null;
  for (const f of fixes) {
    const t = new Date(f.reported_at).getTime();
    if (curTrip !== f.trip_id || !cur || t - new Date(cur.reported_at).getTime() > 30_000) {
      if (cur && curStart != null) {
        const span = (new Date(cur.reported_at).getTime() - curStart) / 1000;
        if (span >= 15 && span <= 180) {
          dwells.push({
            route: cur.route_id ?? "unknown",
            trip: cur.trip_id,
            lat: cur.lat,
            lng: cur.lng,
            sec: span,
            at: cur.reported_at,
          });
        }
      }
      curStart = t;
      curTrip = f.trip_id;
    }
    cur = f;
  }

  if (dwells.length === 0) return 0;

  // Snap each dwell to its nearest stop using active_trips legs (cheap
  // proxy — board/alight stops are the only stop coordinates we have
  // server-side without loading static GTFS here).
  const { data: trips } = await supabaseAdmin
    .from("active_trips")
    .select("trip_id, legs")
    .in("trip_id", [...new Set(dwells.map((d) => d.trip))]);
  const stopsByTrip = new Map<string, Array<{ id: string; lat: number; lng: number }>>();
  for (const t of trips ?? []) {
    const legs = (t.legs ?? []) as Array<{
      kind: string;
      board?: { stopId: string; lat: number; lng: number };
      alight?: { stopId: string; lat: number; lng: number };
    }>;
    const stops: Array<{ id: string; lat: number; lng: number }> = [];
    for (const l of legs) {
      if (l.kind !== "ride") continue;
      if (l.board) stops.push({ id: l.board.stopId, lat: l.board.lat, lng: l.board.lng });
      if (l.alight) stops.push({ id: l.alight.stopId, lat: l.alight.lat, lng: l.alight.lng });
    }
    stopsByTrip.set(t.trip_id, stops);
  }

  let inserted = 0;
  for (const d of dwells) {
    const stops = stopsByTrip.get(d.trip) ?? [];
    let best: { id: string; distM: number } | null = null;
    for (const s of stops) {
      const dist = haversineM({ lat: d.lat, lng: d.lng }, { lat: s.lat, lng: s.lng });
      if (!best || dist < best.distM) best = { id: s.id, distM: dist };
    }
    if (!best || best.distM > 60) continue; // not at a stop
    const dt = new Date(d.at);
    await blendStat(
      "dwell_stats",
      {
        route_id: d.route,
        stop_id: best.id,
        hour_of_day: dt.getUTCHours(),
        day_of_week: dt.getUTCDay(),
      },
      "mean_dwell_sec",
      { mean: d.sec, count: 1 },
    );
    inserted++;
  }
  return inserted;
}

// ---------- feed-vs-truth delta ------------------------------------------
// Compare rider GPS to where the GTFS-RT feed claims that vehicle is at the
// same instant. Distance in meters and inferred time offset (distance / 8 m/s).
async function rollupFeedVsTruth(): Promise<number> {
  // Currently the GTFS-RT vehicle positions live behind /api/public/realtime
  // and aren't persisted, so we approximate using rt_snapshots arrival
  // predictions per trip + stop. v1: skip the spatial comparison and instead
  // accumulate dispersion of rider fixes around the predicted location
  // (proxy for "feed accuracy in this hour"). Keep simple: count of fixes
  // per route+hour as a coverage signal.
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("route_id, reported_at")
    .gte("reported_at", since)
    .limit(20000);
  if (!data) return 0;
  const buckets = new Map<string, number>();
  for (const r of data) {
    if (!r.route_id) continue;
    const d = new Date(r.reported_at);
    const key = `${r.route_id}|${d.getUTCHours()}|${d.getUTCDay()}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  for (const [k, n] of buckets) {
    const [route_id, h, dow] = k.split("|");
    await blendStat(
      "feed_truth_delta",
      {
        route_id,
        hour_of_day: Number(h),
        day_of_week: Number(dow),
      },
      "mean_delta_m",
      { mean: 0, count: n }, // count-only; delta filled in once vehicles persisted
    );
  }
  return buckets.size;
}

// ---------- crowding (concurrent devices per trip / 5-min window) ---------
async function rollupCrowding(): Promise<number> {
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, device_id, reported_at")
    .gte("reported_at", since)
    .limit(20000);
  if (!data) return 0;
  const buckets = new Map<string, { route: string; trip: string; window: string; devices: Set<string> }>();
  for (const r of data) {
    const d = new Date(r.reported_at);
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5, 0, 0);
    const window = d.toISOString();
    const key = `${r.trip_id}|${window}`;
    const b = buckets.get(key) ?? {
      route: r.route_id ?? "unknown",
      trip: r.trip_id,
      window,
      devices: new Set<string>(),
    };
    b.devices.add(r.device_id);
    buckets.set(key, b);
  }
  let inserted = 0;
  for (const b of buckets.values()) {
    const { error } = await supabaseAdmin.from("route_crowding").upsert(
      {
        route_id: b.route,
        trip_id: b.trip,
        window_start: b.window,
        device_count: b.devices.size,
      },
      { onConflict: "trip_id,window_start" },
    );
    if (!error) inserted++;
  }
  return inserted;
}

// ---------- headways (consecutive predictions per route+stop) -------------
async function rollupHeadways(): Promise<number> {
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("rt_snapshots")
    .select("route_id, stop_id, trip_id, predicted_arrival")
    .gte("captured_at", since)
    .order("route_id")
    .order("stop_id")
    .order("predicted_arrival")
    .limit(20000);
  if (!data) return 0;
  const byKey = new Map<string, Array<{ trip: string; at: number }>>();
  for (const r of data) {
    const key = `${r.route_id}|${r.stop_id}`;
    const arr = byKey.get(key) ?? [];
    arr.push({ trip: r.trip_id, at: new Date(r.predicted_arrival).getTime() });
    byKey.set(key, arr);
  }
  let inserted = 0;
  for (const [key, arr] of byKey) {
    const [route_id, stop_id] = key.split("|");
    // De-dupe consecutive predictions of the same trip.
    const unique: typeof arr = [];
    for (const x of arr) if (unique[unique.length - 1]?.trip !== x.trip) unique.push(x);
    for (let i = 1; i < unique.length; i++) {
      const gap = (unique[i].at - unique[i - 1].at) / 1000;
      if (gap < 60 || gap > 7200) continue;
      const d = new Date(unique[i].at);
      const isBunched = gap < 240; // < 4 min between buses = bunching
      const { data: existing } = await supabaseAdmin
        .from("headway_observations")
        .select("observed_headway_sec, sample_count, bunching_count")
        .eq("route_id", route_id)
        .eq("stop_id", stop_id)
        .eq("hour_of_day", d.getUTCHours())
        .eq("day_of_week", d.getUTCDay())
        .maybeSingle();
      const prevMean = existing?.observed_headway_sec ?? 0;
      const prevN = existing?.sample_count ?? 0;
      const newN = prevN + 1;
      const newMean = Math.round((prevMean * prevN + gap) / newN);
      await supabaseAdmin.from("headway_observations").upsert(
        {
          route_id,
          stop_id,
          hour_of_day: d.getUTCHours(),
          day_of_week: d.getUTCDay(),
          observed_headway_sec: newMean,
          sample_count: newN,
          bunching_count: (existing?.bunching_count ?? 0) + (isBunched ? 1 : 0),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "route_id,stop_id,hour_of_day,day_of_week" },
      );
      inserted++;
    }
  }
  return inserted;
}

// ---------- training_events → walk_pace_stats + transfer_outcomes ---------
async function processTrainingEvents(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("training_events")
    .select("id, device_id, kind, payload, recorded_at")
    .is("processed_at", null)
    .limit(5000);
  if (!data || data.length === 0) return 0;

  for (const ev of data) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    if (ev.kind === "walk-complete") {
      const actual = Number(payload.actualSec ?? 0);
      const dist = Number(payload.distanceM ?? 0);
      if (actual >= 5 && dist >= 10) {
        const mps = dist / actual;
        if (mps > 0.3 && mps < 3) {
          const { data: cur } = await supabaseAdmin
            .from("walk_pace_stats")
            .select("mean_mps, sample_count")
            .eq("device_id", ev.device_id)
            .maybeSingle();
          const prevMean = cur?.mean_mps ?? 1.3;
          const prevN = cur?.sample_count ?? 0;
          const newN = prevN + 1;
          const newMean = (prevMean * prevN + mps) / newN;
          await supabaseAdmin.from("walk_pace_stats").upsert({
            device_id: ev.device_id,
            mean_mps: newMean,
            sample_count: newN,
            updated_at: new Date().toISOString(),
          });
        }
      }
    } else if (ev.kind === "transfer-made" || ev.kind === "transfer-missed") {
      const fromRoute = String(payload.fromRoute ?? "");
      const toRoute = String(payload.toRoute ?? "");
      const atStop = String(payload.atStopId ?? "");
      if (!fromRoute || !toRoute || !atStop) continue;
      const d = new Date(ev.recorded_at);
      const key = {
        from_route: fromRoute,
        to_route: toRoute,
        at_stop_id: atStop,
        hour_of_day: d.getUTCHours(),
        day_of_week: d.getUTCDay(),
      };
      const { data: cur } = await supabaseAdmin
        .from("transfer_outcomes")
        .select("attempts, successes, planned_wait_sec")
        .match(key)
        .maybeSingle();
      const attempts = (cur?.attempts ?? 0) + 1;
      const successes = (cur?.successes ?? 0) + (ev.kind === "transfer-made" ? 1 : 0);
      const plannedWait = Number(payload.plannedWaitSec ?? cur?.planned_wait_sec ?? 0);
      await supabaseAdmin.from("transfer_outcomes").upsert(
        {
          ...key,
          attempts,
          successes,
          planned_wait_sec: plannedWait,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "from_route,to_route,at_stop_id,hour_of_day,day_of_week" },
      );
    }
  }

  await supabaseAdmin
    .from("training_events")
    .update({ processed_at: new Date().toISOString() })
    .in(
      "id",
      data.map((d) => d.id),
    );
  return data.length;
}

// ---------- no-shows: scheduled trips with no live signal -----------------
async function detectNoShows(): Promise<number> {
  // A scheduled trip is "no-show" when:
  //  - it was scheduled to arrive at SOME stop within the last 30 min
  //  - we have NO rider fix and NO observed_arrival passed_at for it
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("observed_arrivals")
    .select("trip_id, route_id, last_predicted_arrival, last_seen_at, passed_at")
    .gte("last_seen_at", since)
    .is("passed_at", null)
    .limit(2000);
  if (!data) return 0;
  let inserted = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const r of data) {
    const predicted = new Date(r.last_predicted_arrival).getTime();
    if (Date.now() - predicted < 30 * 60 * 1000) continue; // not late enough yet
    const { data: rf } = await supabaseAdmin
      .from("rider_vehicle_fixes")
      .select("id")
      .eq("trip_id", r.trip_id)
      .limit(1);
    if (rf && rf.length > 0) continue;
    const { error } = await supabaseAdmin.from("trip_no_shows").upsert(
      {
        route_id: r.route_id,
        trip_id: r.trip_id,
        service_date: today,
      },
      { onConflict: "trip_id,service_date" },
    );
    if (!error) inserted++;
  }
  return inserted;
}
