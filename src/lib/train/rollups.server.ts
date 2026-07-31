// Roll-ups derived from rider GPS fixes and realtime snapshots:
// segment runtimes, stop dwell times, and feed-vs-truth accuracy.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { blendStat, haversineM } from "./shared.server";

// ---------- segment runtimes (rider GPS → stop-to-stop times) -------------
// Heuristic v1: per (trip_id) sort fixes, take total duration, distribute
// proportionally across the legs of the active itinerary recorded in
// active_trips. This is rough but real — actual end-to-end time is the
// strongest signal we have until we wire stop-snap.
export async function rollupSegmentRuntimes(): Promise<number> {
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
    const elapsedSec =
      (new Date(last.reported_at).getTime() - new Date(first.reported_at).getTime()) / 1000;
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
export async function rollupDwellTimes(): Promise<number> {
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
  const dwells: Array<{
    route: string;
    trip: string;
    lat: number;
    lng: number;
    sec: number;
    at: string;
  }> = [];
  let cur: (typeof fixes)[number] | null = null;
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
export async function rollupFeedVsTruth(): Promise<number> {
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
