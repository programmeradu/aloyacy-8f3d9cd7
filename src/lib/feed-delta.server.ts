// C2 I/O. Pairing is pure; this loads feed pings + rider GPS and
// writes both mean_delta_m and mean_delta_sec in one upsert.
// Missing table fails silent — the stop stays quiet.

import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow } from "@aloya/core/cy-time";
import {
  bucketPairs,
  pairFeedAndRider,
  pickFeedDeltaHints,
  type FeedDeltaHint,
  type FeedDeltaRow,
  type FeedPing,
  type RiderFix,
} from "@aloya/core/feed-delta";
import { RIDER_PHYSICS_FOLD_MIN } from "@aloya/core/rider-physics";
import routeStops from "@/data/route_stops.json";
import { bulkMerge, trainBudget } from "@/lib/db/bulk";

const db = supabaseAdmin as unknown as SupabaseClient;
const ROUTE_STOPS = routeStops as Record<string, string[]>;
const WINDOW_MS = 3 * 60 * 60_000;
const PAGE = 1000;
const MAX_PINGS = 8_000;
const MAX_FIXES = 8_000;

let _routesByStop: Map<string, string[]> | null = null;

function missingTable(message: string | undefined): boolean {
  return /vehicle_pings|rider_vehicle_fixes|feed_truth_delta|does not exist|schema cache/i.test(
    message ?? "",
  );
}

function routesForStop(stopId: string): string[] {
  if (!_routesByStop) {
    const m = new Map<string, string[]>();
    for (const [routeId, stops] of Object.entries(ROUTE_STOPS)) {
      for (const sid of stops) {
        const arr = m.get(sid);
        if (arr) arr.push(routeId);
        else m.set(sid, [routeId]);
      }
    }
    _routesByStop = m;
  }
  return _routesByStop.get(stopId) ?? [];
}

export async function rollupFeedVsTruth(nowMs = Date.now()): Promise<number> {
  const since = new Date(nowMs - WINDOW_MS).toISOString();
  // Free-plan cap on pages read (each page is one D1 query).
  const scan = Math.min(trainBudget().scanRows, MAX_PINGS);
  const feeds: FeedPing[] = [];
  for (let from = 0; from < scan; from += PAGE) {
    const { data, error } = await db
      .from("vehicle_pings")
      .select("trip_id, route_id, lat, lng, captured_at, source")
      .eq("source", "feed")
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return 0;
    if (!data) break;
    for (const r of data as {
      trip_id: string;
      route_id: string;
      lat: number;
      lng: number;
      captured_at: string;
    }[]) {
      if (!r.trip_id) continue;
      feeds.push({
        tripId: r.trip_id,
        routeId: r.route_id ?? "",
        lat: r.lat,
        lng: r.lng,
        tMs: new Date(r.captured_at).getTime(),
      });
    }
    if (data.length < PAGE) break;
  }
  if (feeds.length === 0) return 0;

  const riders: RiderFix[] = [];
  for (let from = 0; from < Math.min(scan, MAX_FIXES); from += PAGE) {
    const { data, error } = await db
      .from("rider_vehicle_fixes")
      .select("trip_id, lat, lng, reported_at, physics_score")
      .gte("reported_at", since)
      .order("reported_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return 0;
    if (!data) break;
    for (const r of data as {
      trip_id: string;
      lat: number;
      lng: number;
      reported_at: string;
      physics_score: number | null;
    }[]) {
      if (!r.trip_id) continue;
      if (r.physics_score != null && r.physics_score < RIDER_PHYSICS_FOLD_MIN) continue;
      riders.push({
        tripId: r.trip_id,
        lat: r.lat,
        lng: r.lng,
        tMs: new Date(r.reported_at).getTime(),
      });
    }
    if (data.length < PAGE) break;
  }
  if (riders.length === 0) return 0;

  const buckets = bucketPairs(pairFeedAndRider(feeds, riders));
  // Both means blended in SQL, one batched write (was SELECT + UPSERT per bucket).
  try {
    return await bulkMerge(
      "feed_truth_delta",
      buckets.slice(0, trainBudget().writeKeys).map((b) => ({
        route_id: b.routeId,
        hour_of_day: b.hour,
        day_of_week: b.dow,
        mean_delta_m: b.meanDeltaM,
        mean_delta_sec: b.meanDeltaSec,
        sample_count: b.n,
      })),
      {
        key: ["route_id", "hour_of_day", "day_of_week"],
        mean: ["mean_delta_m", "mean_delta_sec"],
        touchUpdatedAt: true,
      },
    );
  } catch (e) {
    if (missingTable((e as Error)?.message)) return 0;
    throw e;
  }
}

export async function loadFeedDeltaHints(
  stopId: string,
  nowMs = Date.now(),
): Promise<FeedDeltaHint[]> {
  const routeIds = routesForStop(stopId).slice(0, 40);
  if (routeIds.length === 0) return [];
  const { hour, dow } = cyHourDow(nowMs);
  const { data, error } = await db
    .from("feed_truth_delta")
    .select("route_id, hour_of_day, day_of_week, mean_delta_m, mean_delta_sec, sample_count")
    .in("route_id", routeIds)
    .eq("hour_of_day", hour)
    .eq("day_of_week", dow)
    .limit(40);
  if (error || !data) return [];
  const rows: FeedDeltaRow[] = [];
  for (const r of data as {
    route_id: string;
    hour_of_day: number;
    day_of_week: number;
    mean_delta_m: number;
    mean_delta_sec: number;
    sample_count: number;
  }[]) {
    if (!r.route_id) continue;
    rows.push({
      routeId: r.route_id,
      hour: r.hour_of_day,
      dow: r.day_of_week,
      meanDeltaM: r.mean_delta_m,
      meanDeltaSec: r.mean_delta_sec,
      n: r.sample_count,
    });
  }
  return pickFeedDeltaHints(rows, nowMs);
}
