// Gold-standard actual arrival: interpolate the instant a vehicle enters
// a stop geofence, from two straddling pings. Independent of the operator's
// own tripUpdate. Pure — no clock, no I/O.

import { distanceM, type LatLng } from "./geo";

/** Same radius the live journey tracker uses to say "the bus is at this stop". */
export const VEHICLE_CROSS_RADIUS_M = 60;
/** Urban ghost cutoff. A wider gap is a guess, not a crossing. */
export const VEHICLE_CROSS_MAX_GAP_MS = 180_000;

export type VehiclePing = {
  tMs: number;
  lat: number;
  lng: number;
};

export type VehicleCrossing = {
  tMs: number;
  distBeforeM: number;
  distAfterM: number;
  gapMs: number;
};

export function interpolateStopCrossing(
  pings: VehiclePing[],
  stop: LatLng,
  radiusM = VEHICLE_CROSS_RADIUS_M,
  maxGapMs = VEHICLE_CROSS_MAX_GAP_MS,
): VehicleCrossing | null {
  if (pings.length < 2) return null;
  const sorted = [...pings].sort((a, b) => a.tMs - b.tMs);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const gap = b.tMs - a.tMs;
    if (gap <= 0 || gap > maxGapMs) continue;
    const d0 = distanceM(a, stop);
    const d1 = distanceM(b, stop);
    if (d0 <= radiusM || d1 > radiusM) continue;
    const denom = d0 - d1;
    const frac = denom <= 0 ? 1 : Math.min(1, Math.max(0, (d0 - radiusM) / denom));
    return {
      tMs: Math.round(a.tMs + frac * gap),
      distBeforeM: d0,
      distAfterM: d1,
      gapMs: gap,
    };
  }
  return null;
}

export type ObservedStop = {
  trip_id: string;
  stop_id: string;
  route_id: string;
};

export type VehicleCrossHit = ObservedStop & {
  actualMs: number;
  distBeforeM: number;
  distAfterM: number;
  gapMs: number;
};

export function vehicleCrossHits(
  observed: ObservedStop[],
  pingsByTrip: Map<string, VehiclePing[]>,
  stopOf: (stopId: string, routeId: string) => LatLng | null,
): VehicleCrossHit[] {
  const out: VehicleCrossHit[] = [];
  const seen = new Set<string>();
  for (const row of observed) {
    const key = `${row.trip_id}|${row.stop_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const stop = stopOf(row.stop_id, row.route_id);
    const pings = pingsByTrip.get(row.trip_id);
    if (!stop || !pings) continue;
    const cross = interpolateStopCrossing(pings, stop);
    if (!cross) continue;
    out.push({
      ...row,
      actualMs: cross.tMs,
      distBeforeM: Math.round(cross.distBeforeM),
      distAfterM: Math.round(cross.distAfterM),
      gapMs: cross.gapMs,
    });
  }
  return out;
}

/** Stronger evidence replaces weaker. Equal or weaker is a no-op. */
export const TRUTH_SOURCE_RANK: Record<string, number> = {
  vehicle: 3,
  rider: 2,
  inferred: 1,
};

export function strongerTruthSource(
  incoming: string,
  existing: string | null | undefined,
): boolean {
  if (!existing) return true;
  return (TRUTH_SOURCE_RANK[incoming] ?? 0) > (TRUTH_SOURCE_RANK[existing] ?? 0);
}
