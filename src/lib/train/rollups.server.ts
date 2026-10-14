// Roll-ups derived from rider GPS fixes and realtime snapshots:
// segment runtimes, stop dwell times, and feed-vs-truth accuracy.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { haversineM } from "./shared.server";
import { bulkMerge, trainBudget, type MergeRow } from "@/lib/db/bulk";
import { cyHourDow } from "@aloya/core/cy-time";

// ---------- segment runtimes (rider GPS → stop-to-stop times) -------------
// Heuristic v1: per (trip_id) sort fixes, take total duration, distribute
// proportionally across the legs of the active itinerary recorded in
// active_trips. This is rough but real — actual end-to-end time is the
// strongest signal we have until we wire stop-snap.
export async function rollupSegmentRuntimes(): Promise<number> {
  const budget = trainBudget();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: fixes } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, lat, lng, reported_at")
    .gte("reported_at", since)
    .order("trip_id")
    .order("reported_at")
    .limit(budget.scanRows);
  if (!fixes || fixes.length < 2) return 0;

  const byTrip = new Map<string, typeof fixes>();
  for (const f of fixes) {
    const arr = byTrip.get(f.trip_id) ?? [];
    arr.push(f);
    byTrip.set(f.trip_id, arr);
  }

  // One query for every candidate trip's planned legs (was one per trip).
  const candidates = [...byTrip].filter(([, arr]) => arr.length >= 4).map(([id]) => id);
  if (candidates.length === 0) return 0;
  const { data: active } = await supabaseAdmin
    .from("active_trips")
    .select("trip_id, legs")
    .in("trip_id", candidates);
  const legsByTrip = new Map<string, unknown>();
  for (const a of (active ?? []) as Array<{ trip_id: string; legs: unknown }>) {
    if (!legsByTrip.has(a.trip_id)) legsByTrip.set(a.trip_id, a.legs);
  }

  const rows: MergeRow[] = [];
  for (const tripId of candidates) {
    const arr = byTrip.get(tripId)!;
    // The rider's planned legs attribute the trip span across known
    // board→alight pairs.
    const legs = (legsByTrip.get(tripId) ?? []) as Array<{
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
    const { hour, dow } = cyHourDow(d.getTime());
    rows.push({
      route_id: ride.routeId ?? first.route_id ?? "unknown",
      from_stop_id: ride.board.stopId,
      to_stop_id: ride.alight.stopId,
      hour_of_day: hour,
      day_of_week: dow,
      mean_runtime_sec: elapsedSec,
      sample_count: 1,
    });
  }
  return bulkMerge("segment_runtimes", rows.slice(0, budget.writeKeys), {
    key: ["route_id", "from_stop_id", "to_stop_id", "hour_of_day", "day_of_week"],
    mean: ["mean_runtime_sec"],
    touchUpdatedAt: true,
  });
}

// ---------- dwell times (rider speed ≈ 0) ---------------------------------
export async function rollupDwellTimes(): Promise<number> {
  const budget = trainBudget();
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: fixes } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, lat, lng, speed_mps, reported_at")
    .gte("reported_at", since)
    .not("speed_mps", "is", null)
    .lte("speed_mps", 0.8)
    .order("trip_id")
    .order("reported_at")
    .limit(budget.scanRows);
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

  const rows: MergeRow[] = [];
  for (const d of dwells) {
    const stops = stopsByTrip.get(d.trip) ?? [];
    let best: { id: string; distM: number } | null = null;
    for (const s of stops) {
      const dist = haversineM({ lat: d.lat, lng: d.lng }, { lat: s.lat, lng: s.lng });
      if (!best || dist < best.distM) best = { id: s.id, distM: dist };
    }
    if (!best || best.distM > 60) continue; // not at a stop
    const dt = new Date(d.at);
    const { hour, dow } = cyHourDow(dt.getTime());
    rows.push({
      route_id: d.route,
      stop_id: best.id,
      hour_of_day: hour,
      day_of_week: dow,
      mean_dwell_sec: d.sec,
      sample_count: 1,
    });
  }
  return bulkMerge("dwell_stats", rows.slice(0, budget.writeKeys), {
    key: ["route_id", "stop_id", "hour_of_day", "day_of_week"],
    mean: ["mean_dwell_sec"],
    touchUpdatedAt: true,
  });
}

// Feed-vs-truth pairing lives in feed-delta.server.ts (both mean fields
// in one upsert). Re-export so the train hook stays a one-line call.
export { rollupFeedVsTruth } from "@/lib/feed-delta.server";
