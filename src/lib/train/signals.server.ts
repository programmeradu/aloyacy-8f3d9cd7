// Roll-ups over rider-reported signals: crowding, headways, training events
// and no-show detection.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow, cyYmd } from "@aloya/core/cy-time";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabaseAdmin as unknown as SupabaseClient;

export async function rollupCrowding(): Promise<number> {
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("rider_vehicle_fixes")
    .select("trip_id, route_id, device_id, reported_at")
    .gte("reported_at", since)
    .limit(20000);
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
export async function rollupHeadways(): Promise<number> {
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
      const { hour, dow } = cyHourDow(unique[i].at);
      const isBunched = gap < 240; // < 4 min between buses = bunching
      const { data: existing } = await supabaseAdmin
        .from("headway_observations")
        .select("observed_headway_sec, sample_count, bunching_count")
        .eq("route_id", route_id)
        .eq("stop_id", stop_id)
        .eq("hour_of_day", hour)
        .eq("day_of_week", dow)
        .maybeSingle();
      const prevMean = existing?.observed_headway_sec ?? 0;
      const prevN = existing?.sample_count ?? 0;
      const newN = prevN + 1;
      const newMean = Math.round((prevMean * prevN + gap) / newN);
      await supabaseAdmin.from("headway_observations").upsert(
        {
          route_id,
          stop_id,
          hour_of_day: hour,
          day_of_week: dow,
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
export async function processTrainingEvents(): Promise<number> {
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
      const { hour, dow } = cyHourDow(d.getTime());
      const key = {
        from_route: fromRoute,
        to_route: toRoute,
        at_stop_id: atStop,
        hour_of_day: hour,
        day_of_week: dow,
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
    .limit(2000);
  if (!data) return 0;
  let inserted = 0;
  const nowMs = Date.now();
  const today = cyYmd(nowMs);
  for (const r of data) {
    const predicted = new Date(r.last_predicted_arrival).getTime();
    if (nowMs - predicted < 30 * 60 * 1000) continue; // not late enough yet
    const { data: rf } = await supabaseAdmin
      .from("rider_vehicle_fixes")
      .select("id")
      .eq("trip_id", r.trip_id)
      .limit(1);
    if (rf && rf.length > 0) continue;
    const { hour, dow } = cyHourDow(predicted);
    const row = {
      route_id: r.route_id,
      trip_id: r.trip_id,
      service_date: today,
      hour_of_day: hour,
      day_of_week: dow,
    };
    let { error } = await db
      .from("trip_no_shows")
      .upsert(row, { onConflict: "trip_id,service_date" });
    if (error && /hour_of_day|schema cache|PGRST204/i.test(error.message)) {
      ({ error } = await db
        .from("trip_no_shows")
        .upsert(
          { route_id: r.route_id, trip_id: r.trip_id, service_date: today },
          { onConflict: "trip_id,service_date" },
        ));
    }
    if (!error) inserted++;
  }
  return inserted;
}
