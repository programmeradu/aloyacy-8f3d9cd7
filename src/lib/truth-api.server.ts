// Aloya Truth API (v1) server implementation.
// The B2B clearing house layer: serves the exact same truth classifier the rider
// sees, logs every returned prediction to `eta_predictions` with `surface: 'api'`
// so the feed is scored nightly against arrival_truth.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchRealtime } from "@/lib/gtfs-rt.server";
import { getStop, getRoute } from "@/lib/gtfs";
import { getHeadsignSync } from "@/lib/headsigns";
import { getShapeForTripSync } from "@/lib/shapes";
import { smartEtaV2 } from "@/lib/eta-v2";
import { cyHourDow } from "@aloya/core/cy-time";
import { createLogger } from "@/lib/logger";
import type { TruthEtaQuery } from "@/lib/schemas/truth-api";

const log = createLogger("truth-api");
const db = supabaseAdmin as unknown as SupabaseClient;

export interface TruthVehicle {
  id: string;
  lat: number;
  lng: number;
  bearing: number | null;
  speed_mps: number | null;
}

export interface TruthReliability {
  on_time_pct: number;
  sample_count: number;
  tier: string;
}

export interface TruthDeparture {
  trip_id: string;
  route_id: string;
  route_short: string;
  headsign: string;
  agency: string;
  p50_sec: number;
  eta_min: number;
  p25_sec: number;
  p90_sec: number;
  tier: string;
  confidence: "high" | "medium" | "low";
  ping_age_sec: number | null;
  operator_eta_sec: number | null;
  learned_bias_sec: number;
  vehicle: TruthVehicle | null;
  reliability: TruthReliability | null;
  source_mix: "vehicle_cross" | "rider_gps" | "feed_prediction" | "scheduled";
}

export interface TruthApiResponse {
  ok: true;
  api_version: "v1";
  fetched_at: string;
  stop: {
    id: string;
    name: string;
    agency: string;
    lat: number;
    lng: number;
  };
  departures: TruthDeparture[];
}

export async function loadTruthEta(query: TruthEtaQuery, nowMs = Date.now()): Promise<TruthApiResponse> {
  const stop = getStop(query.stop_id);
  if (!stop) {
    throw new Error(`Stop ${query.stop_id} not found`);
  }

  const nowSec = Math.floor(nowMs / 1000);
  const snap = await fetchRealtime();

  // Filter arrivals for this stop, optionally filtered by route_id and trip_id
  const seen = new Set<string>();
  const rawArrivals = snap.arrivals
    .filter((a) => {
      if (a.stopId !== query.stop_id) return false;
      if (query.route_id && a.routeId !== query.route_id) return false;
      if (query.trip_id && a.tripId !== query.trip_id) return false;
      return a.arrivalUnix >= nowSec - 30;
    })
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
    .filter((a) => (seen.has(a.tripId) ? false : (seen.add(a.tripId), true)));

  // Load reliability for these routes at this stop
  const routeIds = Array.from(new Set(rawArrivals.map((a) => a.routeId)));
  const reliabilityByRoute = new Map<string, TruthReliability>();

  if (routeIds.length > 0) {
    const { data: stats } = await db
      .from("delay_stats")
      .select("route_id, mean_delay_sec, stddev_delay_sec, sample_count")
      .eq("stop_id", query.stop_id)
      .in("route_id", routeIds)
      .gte("sample_count", 5);

    if (stats && stats.length > 0) {
      for (const s of stats) {
        const count = Number(s.sample_count) || 0;
        const mean = Number(s.mean_delay_sec) || 0;
        const onTime = Math.max(0, Math.min(100, Math.round(100 - (Math.abs(mean) / 120) * 40)));
        reliabilityByRoute.set(s.route_id, {
          on_time_pct: onTime,
          sample_count: count,
          tier: count >= 30 ? (onTime >= 80 ? "high" : "medium") : "low",
        });
      }
    }
  }

  // Calculate SmartEtaV2 for candidate arrivals
  const departures: TruthDeparture[] = [];
  const logRows: Array<Record<string, unknown>> = [];
  const { hour, dow } = cyHourDow(nowMs);

  for (const a of rawArrivals) {
    if (departures.length >= query.limit) break;

    const route = getRoute(a.routeId);
    const headsign = getHeadsignSync(a.tripId, a.routeId);
    const shape = getShapeForTripSync(a.tripId, a.routeId);

    const eta = smartEtaV2({
      stopId: query.stop_id,
      arrivals: snap.arrivals,
      vehicles: snap.vehicles,
      nowSec,
      agency: stop.agency,
      shape,
    });

    if (!eta) continue;

    // Determine corresponding vehicle info
    const vehicle = snap.vehicles.find((v) => v.tripId === a.tripId);
    const truthVehicle: TruthVehicle | null = vehicle
      ? {
          id: vehicle.id,
          lat: vehicle.lat,
          lng: vehicle.lng,
          bearing: vehicle.bearing ?? null,
          speed_mps: vehicle.speed ?? null,
        }
      : null;

    let sourceMix: TruthDeparture["source_mix"] = "feed_prediction";
    if (eta.tier === "live") {
      sourceMix = "vehicle_cross";
    } else if (eta.tier === "rider-confirmed") {
      sourceMix = "rider_gps";
    } else if (eta.tier === "scheduled" || eta.tier === "ghost") {
      sourceMix = "scheduled";
    }

    const dep: TruthDeparture = {
      trip_id: a.tripId,
      route_id: a.routeId,
      route_short: route?.short || a.routeId,
      headsign: headsign ?? route?.long ?? "",
      agency: route?.agency || stop.agency,
      p50_sec: Math.round(eta.etaSec),
      eta_min: Math.round(eta.etaMin),
      p25_sec: Math.round(eta.lowerSec),
      p90_sec: Math.round(eta.upperSec),
      tier: eta.tier,
      confidence: eta.confidence,
      ping_age_sec: Number.isFinite(eta.pingAgeSec) ? Math.round(eta.pingAgeSec) : null,
      operator_eta_sec: Number.isFinite(eta.operatorEtaMin) ? Math.round(eta.operatorEtaMin * 60) : null,
      learned_bias_sec: Math.round(eta.learnedBiasSec),
      vehicle: truthVehicle,
      reliability: reliabilityByRoute.get(a.routeId) ?? null,
      source_mix: sourceMix,
    };

    departures.push(dep);

    // Prepare ledger log row
    logRows.push({
      trip_id: dep.trip_id,
      route_id: dep.route_id,
      stop_id: query.stop_id,
      horizon_sec: dep.p50_sec,
      p50_sec: dep.p50_sec,
      p25_sec: dep.p25_sec,
      p90_sec: dep.p90_sec,
      tier: dep.tier,
      confidence: dep.confidence,
      operator_eta_sec: dep.operator_eta_sec,
      learned_bias_sec: dep.learned_bias_sec,
      surface: "api",
      hour_of_day: hour,
      day_of_week: dow,
    });
  }

  // Fire-and-forget clearing house ledger logging
  if (logRows.length > 0) {
    void (async () => {
      try {
        const { error } = await db.from("eta_predictions").insert(logRows);
        if (error) log.warn("Truth API failed to log predictions to ledger", { error: error.message });
      } catch (err) {
        log.warn("Truth API ledger insert threw", { error: err instanceof Error ? err.message : String(err) });
      }
    })();
  }

  return {
    ok: true,
    api_version: "v1",
    fetched_at: new Date(nowMs).toISOString(),
    stop: {
      id: stop.id,
      name: stop.name,
      agency: stop.agency,
      lat: stop.lat,
      lng: stop.lng,
    },
    departures,
  };
}
