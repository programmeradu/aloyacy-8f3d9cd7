// Pure primitives behind the schedule-based RAPTOR planner.
//
// Everything here is deterministic arithmetic over plain data: walking
// estimates, candidate-stop selection, the spatial bucket index used for
// transfer lookups, and the itinerary scoring/finalisation step. The server
// module keeps only the round loop and the schedule I/O, so this logic can be
// unit-tested without loading a GTFS shard.

import type { Itinerary, Leg, RideLeg, WalkLeg } from "./itinerary-types";
import { scoreLegs, type PlanContext } from "./multileg-rank";
export type { PlanContext };

/** Search-shape constants. Shared so web and any future native planner agree. */
export const RAPTOR_TUNING = {
  /** 1 ride + up to 4 transfer rides — enough to cross the island. */
  maxRounds: 5,
  maxAccessWalkKm: 2.0,
  maxEgressWalkKm: 3.0,
  /**
   * Widest final-stop net. One radius for every option: a one-seat ride is
   * kept because nothing beats it, not because it was allowed a longer walk
   * than its rivals.
   */
  maxDirectEgressWalkKm: 3.0,
  maxTransferWalkM: 600,
  /** Large terminals expose many bays; keep enough candidates to cover each bay. */
  topOriginStops: 8,
  topDestStops: 8,
  /** Ceiling once station bays and otherwise-missing routes are admitted. */
  maxOriginCandidates: 28,
  maxDestCandidates: 28,
  minTransferBufferSec: 90,
  /** Cross-island + airport connections. */
  maxTotalJourneySec: 300 * 60,
  topKResults: 5,
  /** "Leave now" — 4h is plenty for the dense corridors. */
  defaultSearchHorizonSec: 4 * 3600,
  walkMetersPerSec: 1.35,
  /** Street network detour factor over straight-line distance. */
  walkDetour: 1.35,
  /** Fan-out cap per stop when looking for walking transfers. */
  maxTransferNeighbours: 6,
} as const;

/** Minimum shape the planner needs from a schedule stop. */
export type StopLike = { lat: number; lng: number; name: string };

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line meters → walking seconds, including the detour factor. */
export function walkSecFromMeters(m: number): number {
  return Math.round((m * RAPTOR_TUNING.walkDetour) / RAPTOR_TUNING.walkMetersPerSec);
}

/** Straight-line meters → the on-street meters we quote to the rider. */
export function walkMetersOnStreet(straightM: number): number {
  return Math.round(straightM * RAPTOR_TUNING.walkDetour);
}

export type NearestStop<S extends StopLike> = { id: string; stop: S; distKm: number };

/**
 * The `topN` schedule stops within `maxKm` of a point, nearest first.
 * A cheap bounding-box reject runs before the haversine so scanning the full
 * island stop set stays fast.
 */
export function nearestStops<S extends StopLike>(
  list: Array<[string, S]>,
  point: { lat: number; lng: number },
  maxKm: number,
  topN: number,
): Array<NearestStop<S>> {
  const out: Array<NearestStop<S>> = [];
  for (const [id, s] of list) {
    if (Math.abs(s.lat - point.lat) > 0.03) continue;
    if (Math.abs(s.lng - point.lng) > 0.035) continue;
    const distKm = haversineKm(s, point);
    if (distKm > maxKm) continue;
    out.push({ id, stop: s, distKm });
  }
  out.sort((a, b) => a.distKm - b.distKm);
  return out.slice(0, topN);
}

// ---- spatial bucket index --------------------------------------------------
// Bucket by 0.005° (~500 m in Cyprus); a stop and its neighbours fall in at
// most the 9 surrounding buckets.

export type Buckets = Map<string, string[]>;
const BUCKET_DEG = 0.005;

export function bucketKey(lat: number, lng: number): string {
  return `${Math.floor(lat / BUCKET_DEG)}:${Math.floor(lng / BUCKET_DEG)}`;
}

export function buildSpatialBuckets<S extends StopLike>(stops: Record<string, S>): Buckets {
  const b: Buckets = new Map();
  for (const [id, s] of Object.entries(stops)) {
    const k = bucketKey(s.lat, s.lng);
    const bucket = b.get(k);
    if (bucket) bucket.push(id);
    else b.set(k, [id]);
  }
  return b;
}

/**
 * Walkable neighbours of a stop as `[stopId, onStreetMeters]`, nearest first
 * and capped at `RAPTOR_TUNING.maxTransferNeighbours`.
 */
export function nearbyStops<S extends StopLike>(
  buckets: Buckets,
  stops: Record<string, S>,
  from: { lat: number; lng: number },
  maxMeters: number,
): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  const baseLat = Math.floor(from.lat / BUCKET_DEG);
  const baseLng = Math.floor(from.lng / BUCKET_DEG);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = buckets.get(`${baseLat + dy}:${baseLng + dx}`);
      if (!list) continue;
      for (const id of list) {
        const s = stops[id];
        if (!s) continue;
        const m = haversineKm(from, s) * 1000;
        if (m > maxMeters) continue;
        out.push([id, walkMetersOnStreet(m)]);
      }
    }
  }
  out.sort((a, b) => a[1] - b[1]);
  return out.slice(0, RAPTOR_TUNING.maxTransferNeighbours);
}

// ---- scoring / finalisation ------------------------------------------------

/**
 * Wall-clock arrival implied by a leg sequence: walks and waits advance the
 * cursor, a ride jumps it to that ride's alight time.
 */
export function lastEnd(legs: Leg[], departureUnix: number): number {
  let cursor = departureUnix;
  for (const l of legs) {
    if (l.kind === "walk" || l.kind === "wait") cursor += l.durationSec;
    else if (l.kind === "ride") {
      cursor = Math.max(cursor, l.board.departureUnix);
      cursor = l.alight.arrivalUnix;
    }
  }
  return cursor;
}

/**
 * Turn a leg sequence into a scored Itinerary DTO, using the one shared cost
 * model in `plan-score.ts` so the schedule planner and the live planner never
 * disagree about what an option is worth. The caller passes the station index
 * and measured headways when it has them; without them the model falls back
 * to a stated assumption rather than an invented constant.
 */
export function finalise(
  legs: Leg[],
  departureUnix: number,
  ctx?: PlanContext,
): Itinerary {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const walks = legs.filter((l): l is WalkLeg => l.kind === "walk");
  const arrivalUnix = lastEnd(legs, departureUnix);
  const totalDurationSec = arrivalUnix - departureUnix;
  const totalWalkMeters = walks.reduce((acc, w) => acc + w.distanceMeters, 0);
  const transfers = Math.max(0, rides.length - 1);
  const score = scoreLegs(legs, totalDurationSec, ctx);
  const sig = rides.map((r) => `${r.routeId}-${r.board.stopId}-${r.alight.stopId}`).join("+");
  return {
    id: `rap-${sig}-${departureUnix}`,
    legs,
    totalDurationSec,
    departureUnix,
    arrivalUnix,
    transfers,
    totalWalkMeters,
    score,
    source: "estimated",
  };
}

