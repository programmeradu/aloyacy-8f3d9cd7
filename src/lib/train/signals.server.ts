// Roll-ups over rider-reported signals: crowding, headways, training events
// and no-show detection.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow, cyYmd } from "@aloya/core/cy-time";
import type { SupabaseClient } from "@/lib/db/compat";
import { bulkMerge, trainBudget, type MergeRow } from "@/lib/db/bulk";

const db = supabaseAdmin as unknown as SupabaseClient;

export async function rollupCrowding(): Promise<number> {
  const budget = trainBudget();
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, device_id, reported_at")
    .gte("reported_at", since)
    .limit(budget.scanRows);
  if (!data) return 0;
  const buckets = new Map<
    string,
    { route: string; trip: string; window: string; devices: Set<string> }
  >();
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
  // One multi-row upsert (the adapter chunks it into a single D1 batch).
  const rows = [...buckets.values()].slice(0, budget.writeKeys).map((b) => ({
    route_id: b.route,
    trip_id: b.trip,
    window_start: b.window,
    device_count: b.devices.size,
  }));
  if (rows.length === 0) return 0;
  const { error } = await supabaseAdmin
    .from("route_crowding")
    .upsert(rows, { onConflict: "trip_id,window_start" });
  return error ? 0 : rows.length;
}

// ---------- headways (consecutive predictions per route+stop) -------------
export async function rollupHeadways(): Promise<number> {
  const budget = trainBudget();
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("rt_snapshots")
    .select("route_id, stop_id, trip_id, predicted_arrival")
    .gte("captured_at", since)
    .order("route_id")
    .order("stop_id")
    .order("predicted_arrival")
    .limit(budget.scanRows);
  if (!data) return 0;
  const byKey = new Map<string, Array<{ trip: string; at: number }>>();
  for (const r of data) {
    const key = `${r.route_id}|${r.stop_id}`;
    const arr = byKey.get(key) ?? [];
    arr.push({ trip: r.trip_id, at: new Date(r.predicted_arrival).getTime() });
    byKey.set(key, arr);
  }
  const rows: MergeRow[] = [];
  for (const [key, arr] of byKey) {
    const [route_id, stop_id] = key.split("|");
    // De-dupe consecutive predictions of the same trip.
    const unique: typeof arr = [];
    for (const x of arr) if (unique[unique.length - 1]?.trip !== x.trip) unique.push(x);
    for (let i = 1; i < unique.length; i++) {
      const gap = (unique[i].at - unique[i - 1].at) / 1000;
      if (gap < 60 || gap > 7200) continue;
      const { hour, dow } = cyHourDow(unique[i].at);
      const isBunched = gap < 240; // < 4 min between buses = bunching
      rows.push({
        route_id: route_id ?? "",
        stop_id: stop_id ?? "",
        hour_of_day: hour,
        day_of_week: dow,
        observed_headway_sec: gap,
        sample_count: 1,
        bunching_count: isBunched ? 1 : 0,
      });
    }
  }
  return bulkMerge("headway_observations", rows.slice(0, budget.writeKeys), {
    key: ["route_id", "stop_id", "hour_of_day", "day_of_week"],
    mean: ["observed_headway_sec"],
    roundMean: true,
    sum: ["bunching_count"],
    touchUpdatedAt: true,
  });
}

// ---------- training_events → walk_pace_stats + transfer_outcomes ---------
export async function processTrainingEvents(): Promise<number> {
  const budget = trainBudget();
  const { data } = await supabaseAdmin
    .from("training_events")
    .select("id, device_id, kind, payload, recorded_at")
    .is("processed_at", null)
    .order("recorded_at")
    .limit(Math.min(budget.scanRows, budget.writeKeys));
  if (!data || data.length === 0) return 0;

  // Folded in memory, written with two set-based upserts (was a SELECT +
  // UPSERT per event).
  const walks: MergeRow[] = [];
  const transfers: MergeRow[] = [];
  for (const ev of data) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    if (ev.kind === "walk-complete") {
      const actual = Number(payload.actualSec ?? 0);
      const dist = Number(payload.distanceM ?? 0);
      if (actual >= 5 && dist >= 10) {
        const mps = dist / actual;
        if (mps > 0.3 && mps < 3) walks.push({ device_id: ev.device_id, mean_mps: mps, sample_count: 1 });
      }
    } else if (ev.kind === "transfer-made" || ev.kind === "transfer-missed") {
      const fromRoute = String(payload.fromRoute ?? "");
      const toRoute = String(payload.toRoute ?? "");
      const atStop = String(payload.atStopId ?? "");
      if (!fromRoute || !toRoute || !atStop) continue;
      const { hour, dow } = cyHourDow(new Date(ev.recorded_at).getTime());
      transfers.push({
        from_route: fromRoute,
        to_route: toRoute,
        at_stop_id: atStop,
        hour_of_day: hour,
        day_of_week: dow,
        attempts: 1,
        successes: ev.kind === "transfer-made" ? 1 : 0,
        planned_wait_sec: Number(payload.plannedWaitSec ?? 0),
      });
    }
  }

  await bulkMerge("walk_pace_stats", walks, {
    key: ["device_id"],
    mean: ["mean_mps"],
    touchUpdatedAt: true,
  });
  await bulkMerge("transfer_outcomes", transfers, {
    key: ["from_route", "to_route", "at_stop_id", "hour_of_day", "day_of_week"],
    sum: ["attempts", "successes"],
    replace: ["planned_wait_sec"],
    touchUpdatedAt: true,
  });

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
export async function detectNoShows(): Promise<number> {
  // A scheduled trip is "no-show" when:
  //  - it was scheduled to arrive at SOME stop within the last 30 min
  //  - we have NO rider fix and NO observed_arrival passed_at for it
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("observed_arrivals")
    .select("trip_id, route_id, last_predicted_arrival, last_seen_at, passed_at")
    .gte("last_seen_at", since)
    .is("passed_at", null)
    .limit(trainBudget().scanRows);
  if (!data) return 0;
  const nowMs = Date.now();
  const today = cyYmd(nowMs);
  const late = data.filter(
    (r) => nowMs - new Date(r.last_predicted_arrival).getTime() >= 30 * 60 * 1000,
  );
  if (late.length === 0) return 0;
  // One lookup for every late trip that a rider reported (was one per trip).
  const { data: seen } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id")
    .in("trip_id", [...new Set(late.map((r) => r.trip_id))]);
  const withFix = new Set(((seen ?? []) as Array<{ trip_id: string }>).map((r) => r.trip_id));
  const byTrip = new Map<string, Record<string, unknown>>();
  for (const r of late) {
    if (withFix.has(r.trip_id) || byTrip.has(r.trip_id)) continue;
    const { hour, dow } = cyHourDow(new Date(r.last_predicted_arrival).getTime());
    byTrip.set(r.trip_id, {
      route_id: r.route_id,
      trip_id: r.trip_id,
      service_date: today,
      hour_of_day: hour,
      day_of_week: dow,
    });
  }
  const rows = [...byTrip.values()].slice(0, trainBudget().writeKeys);
  if (rows.length === 0) return 0;
  const { error } = await db.from("trip_no_shows").upsert(rows, { onConflict: "trip_id,service_date" });
  return error ? 0 : rows.length;
}
