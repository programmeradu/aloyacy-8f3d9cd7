// A2 resolver. Vehicle-cross first (geofence interpolation), inferred
// later-stop evidence second. Never overwrite a stronger source.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow } from "@aloya/core/cy-time";
import { strongerTruthSource, vehicleCrossHits, type VehiclePing } from "@aloya/core/vehicle-cross";
import { classifyStopVisit } from "@aloya/core/skip-rate";
import { getRoute, getStop } from "@/lib/gtfs";
import { loadTripPings } from "@/lib/vehicle-pings.server";
import { recordSkipVisit } from "@/lib/skip-rate.server";

const db = supabaseAdmin as unknown as SupabaseClient;

type Observed = {
  trip_id: string;
  stop_id: string;
  route_id: string;
  last_predicted_arrival: string;
  last_seen_at: string;
};

function stopLatLng(stopId: string, routeId: string) {
  const agency = getRoute(routeId)?.agency;
  const stop = getStop(stopId, agency);
  if (!stop) return null;
  return { lat: stop.lat, lng: stop.lng };
}

async function writeTruth(row: {
  trip_id: string;
  stop_id: string;
  route_id: string;
  actual_arrival: string;
  source: string;
  evidence: Record<string, unknown>;
}): Promise<boolean> {
  const { data: existing } = await db
    .from("arrival_truth")
    .select("source")
    .eq("trip_id", row.trip_id)
    .eq("stop_id", row.stop_id)
    .maybeSingle();
  if (!strongerTruthSource(row.source, (existing as { source?: string } | null)?.source)) {
    return false;
  }
  const { hour, dow } = cyHourDow(new Date(row.actual_arrival).getTime());
  const { error } = await db.from("arrival_truth").upsert(
    {
      trip_id: row.trip_id,
      stop_id: row.stop_id,
      route_id: row.route_id,
      actual_arrival: row.actual_arrival,
      source: row.source,
      evidence: row.evidence,
      hour_of_day: hour,
      day_of_week: dow,
    },
    { onConflict: "trip_id,stop_id" },
  );
  if (error) return false;
  const { error: updErr } = await db
    .from("observed_arrivals")
    .update({ passed_at: row.actual_arrival })
    .eq("trip_id", row.trip_id)
    .eq("stop_id", row.stop_id)
    .is("passed_at", null);
  return !updErr;
}

async function loadUnresolved(nowMs: number): Promise<Observed[]> {
  const from = new Date(nowMs - 45 * 60_000).toISOString();
  const until = new Date(nowMs - 90_000).toISOString();
  const { data, error } = await db
    .from("observed_arrivals")
    .select("trip_id, stop_id, route_id, last_predicted_arrival, last_seen_at")
    .is("passed_at", null)
    .gt("last_predicted_arrival", from)
    .lt("last_predicted_arrival", until)
    .limit(800);
  if (error || !data) return [];
  return data as Observed[];
}

export async function resolveVehicleCrossArrivals(
  nowMs = Date.now(),
  loadPings: (ids: string[], now: number) => Promise<Map<string, VehiclePing[]>> = loadTripPings,
): Promise<number> {
  const unresolved = await loadUnresolved(nowMs);
  if (unresolved.length === 0) return 0;
  const pings = await loadPings(
    unresolved.map((r) => r.trip_id),
    nowMs,
  );
  const hits = vehicleCrossHits(unresolved, pings, stopLatLng);
  for (const hit of hits) {
    const stop = stopLatLng(hit.stop_id, hit.route_id);
    const tripPings = pings.get(hit.trip_id);
    if (!stop || !tripPings) continue;
    const visit = classifyStopVisit(tripPings, stop);
    if (!visit) continue;
    await recordSkipVisit({
      stopId: hit.stop_id,
      routeId: hit.route_id,
      tripId: hit.trip_id,
      outcome: visit.outcome,
      dwellSec: visit.dwellSec,
      classifiedAt: hit.actualMs,
    });
  }
  let resolved = 0;
  for (const hit of hits) {
    const ok = await writeTruth({
      trip_id: hit.trip_id,
      stop_id: hit.stop_id,
      route_id: hit.route_id,
      actual_arrival: new Date(hit.actualMs).toISOString(),
      source: "vehicle",
      evidence: {
        dist_before_m: hit.distBeforeM,
        dist_after_m: hit.distAfterM,
        gap_ms: hit.gapMs,
      },
    });
    if (ok) resolved += 1;
  }
  return resolved;
}

export async function resolveInferredArrivals(nowMs = Date.now()): Promise<number> {
  const unresolved = await loadUnresolved(nowMs);
  const byTrip = new Map<string, Observed[]>();
  for (const row of unresolved) {
    const arr = byTrip.get(row.trip_id) ?? [];
    arr.push(row);
    byTrip.set(row.trip_id, arr);
  }
  let resolved = 0;
  for (const rows of byTrip.values()) {
    if (rows.length < 2) continue;
    rows.sort(
      (a, b) =>
        new Date(a.last_predicted_arrival).getTime() - new Date(b.last_predicted_arrival).getTime(),
    );
    for (let i = 0; i < rows.length - 1; i++) {
      const here = rows[i]!;
      const later = rows
        .slice(i + 1)
        .find(
          (r) =>
            new Date(r.last_seen_at).getTime() > new Date(here.last_predicted_arrival).getTime(),
        );
      if (!later) continue;
      const actual = here.last_predicted_arrival;
      const ok = await writeTruth({
        trip_id: here.trip_id,
        stop_id: here.stop_id,
        route_id: here.route_id,
        actual_arrival: actual,
        source: "inferred",
        evidence: { later_stop_id: later.stop_id, later_seen_at: later.last_seen_at },
      });
      if (ok) resolved += 1;
    }
  }
  return resolved;
}

export async function resolveArrivals(nowMs = Date.now()): Promise<{
  vehicle: number;
  inferred: number;
}> {
  const vehicle = await resolveVehicleCrossArrivals(nowMs);
  const inferred = await resolveInferredArrivals(nowMs);
  return { vehicle, inferred };
}
