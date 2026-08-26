// Building blocks for the multi-leg planner: tunables, walk maths, live-feed
// indexing, leg construction, scoring and ranking. Kept separate from the
// search loop in `multileg-search.ts` so each file stays small and each piece
// is testable on its own.
//
// Scoring itself lives in `plan-score.ts` — one model shared by the live
// search, the schedule search and the post-verification re-rank, so they can
// never drift apart or disagree about what a change is worth.

import { distanceM } from "./geo";
import type { Itinerary, Leg, RideLeg, WalkLeg, WaitLeg } from "./itinerary-types";


// ---- Tunables (all explicit so we can audit any change) -------------------
export const MAX_ACCESS_WALK_KM = 2.0; // origin → first board stop
/**
 * Last alight → destination. One radius for every option: a no-change ride is
 * not allowed a longer walk than a ride with a change, and vice versa. Long
 * walks are priced by the scorer and beaten by dominance, not forbidden by
 * shape.
 */
export const MAX_EGRESS_WALK_KM = 3.0;
export const MAX_TRANSFER_WALK_M = 600; // walking between transfer stops
/**
 * Nearest-N stops always considered. Extra candidates are admitted only when
 * they add a station bay or a route the set does not already cover, so a
 * terminal never crowds out the routes that leave from its far bays.
 */
export const TOP_ORIGIN_STOPS = 6;
export const TOP_DEST_STOPS = 6;
export const MAX_ORIGIN_CANDIDATES = 24;
export const MAX_DEST_CANDIDATES = 24;
export const TOP_ALIGHT_CANDIDATES_PER_TRIP = 12;
export const MIN_TRANSFER_BUFFER_SEC = 90;
export const MAX_TOTAL_JOURNEY_SEC = 90 * 60; // 90 min hard cap
export const TOP_K_RESULTS = 5;

export const WALK_M_PER_S = 1.35;
export const WALK_DETOUR = 1.35;

export function walkSecFromMeters(m: number): number {
  return Math.round((m * WALK_DETOUR) / WALK_M_PER_S);
}
export function walkSecFromKm(km: number): number {
  return walkSecFromMeters(km * 1000);
}


export type LatLng = { lat: number; lng: number };

export function distanceKm(a: LatLng, b: LatLng): number {
  return distanceM(a, b) / 1000;
}

// ---- Inputs ---------------------------------------------------------------
export type MlStop = { id: string; name: string; lat: number; lng: number };
export type MlRouteMeta = { short?: string; long?: string };
export type MlArrival = {
  tripId: string;
  routeId: string;
  stopId: string;
  arrivalUnix: number;
  delaySec: number;
};

export type MultiLegInput = {
  from: LatLng & { label?: string };
  to: LatLng & { label?: string };
  stops: MlStop[];
  routeById: Map<string, MlRouteMeta>;
  arrivals: MlArrival[];
  /** stopId → nearby stops reachable on foot (already capped by the caller). */
  transferIndex: Map<string, Array<{ toStopId: string }>>;
  /** Seconds since epoch; injected so tests are deterministic. */
  now: number;
  /** True when two stop records are bays of the same physical station. */
  sameStation?: (aStopId: string, bStopId: string) => boolean;
  /** Station id for a stop record, used to spread candidates across bays. */
  stationIdOf?: (stopId: string) => string | undefined;
  /** Typical seconds between departures on a route, when known. */
  headwayOf?: (routeId: string) => number | null;
};


export type MultiLegDiagnostics = {
  originStopCount: number;
  destStopCount: number;
  nearestOriginStopKm: number | null;
  nearestDestStopKm: number | null;
  liveTripCount: number;
  liveArrivalCount: number;
  originTripCount: number;
  destTripCount: number;
  directRawCount: number;
  transferRawCount: number;
  validCount: number;
  keptCount: number;
  prunedMediocre: number;
  reasons: string[];
};

export function emptyDiagnostics(): MultiLegDiagnostics {
  return {
    originStopCount: 0,
    destStopCount: 0,
    nearestOriginStopKm: null,
    nearestDestStopKm: null,
    liveTripCount: 0,
    liveArrivalCount: 0,
    originTripCount: 0,
    destTripCount: 0,
    directRawCount: 0,
    transferRawCount: 0,
    validCount: 0,
    keptCount: 0,
    prunedMediocre: 0,
    reasons: [],
  };
}

// ---- Realtime indexing ----------------------------------------------------
export type StopVisit = { stopId: string; arrivalUnix: number; delaySec: number };

export type TripSlice = {
  tripId: string;
  routeId: string;
  /** Ordered ascending by arrivalUnix. */
  stops: StopVisit[];
  /** stopId → first index in `stops` (legacy fast lookup). */
  indexOf: Map<string, number>;
  /** stopId → every visit index, needed by circular routes and loop services. */
  indicesOf: Map<string, number[]>;
};

export type TripIndex = {
  trips: Map<string, TripSlice>;
  /** stopId → tripIds visiting it. */
  tripsByStop: Map<string, string[]>;
};

export function buildTripIndex(arrivals: MlArrival[], now: number): TripIndex {
  const raw = new Map<string, StopVisit[]>();
  const routeOfTrip = new Map<string, string>();

  for (const a of arrivals) {
    if (a.arrivalUnix < now - 60) continue; // already passed
    let list = raw.get(a.tripId);
    if (!list) {
      list = [];
      raw.set(a.tripId, list);
    }
    list.push({ stopId: a.stopId, arrivalUnix: a.arrivalUnix, delaySec: a.delaySec });
    routeOfTrip.set(a.tripId, a.routeId);
  }

  const trips = new Map<string, TripSlice>();
  const tripsByStop = new Map<string, string[]>();

  for (const [tripId, visits] of raw) {
    visits.sort((a, b) => a.arrivalUnix - b.arrivalUnix);
    const indexOf = new Map<string, number>();
    const indicesOf = new Map<string, number[]>();
    for (let i = 0; i < visits.length; i++) {
      if (!indexOf.has(visits[i].stopId)) indexOf.set(visits[i].stopId, i);
      const indices = indicesOf.get(visits[i].stopId);
      if (indices) indices.push(i);
      else indicesOf.set(visits[i].stopId, [i]);
    }
    trips.set(tripId, {
      tripId,
      routeId: routeOfTrip.get(tripId)!,
      stops: visits,
      indexOf,
      indicesOf,
    });
    for (const v of visits) {
      let bucket = tripsByStop.get(v.stopId);
      if (!bucket) {
        bucket = [];
        tripsByStop.set(v.stopId, bucket);
      }
      // A circular service may visit the same stop more than once. Keep all
      // visit indices on the trip, but expose the trip only once per stop so
      // the search does not emit duplicate itineraries.
      if (bucket[bucket.length - 1] !== tripId && !bucket.includes(tripId)) {
        bucket.push(tripId);
      }
    }
  }

  return { trips, tripsByStop };
}

// ---- Leg builders ---------------------------------------------------------
export type NearStop = MlStop & { distanceKm: number };

export function cheapTransferWalk(
  stopById: Map<string, MlStop>,
  fromId: string,
  toId: string,
): { meters: number; sec: number } | null {
  if (fromId === toId) return { meters: 0, sec: 0 };
  const a = stopById.get(fromId);
  const b = stopById.get(toId);
  if (!a || !b) return null;
  const meters = Math.round(distanceKm(a, b) * 1000 * WALK_DETOUR);
  if (meters > MAX_TRANSFER_WALK_M) return null;
  return { meters, sec: walkSecFromMeters(meters / WALK_DETOUR) };
}

export function buildAccessWalkLeg(from: LatLng & { label?: string }, stop: NearStop): WalkLeg {
  return {
    kind: "walk",
    from: { name: from.label ?? "Start", lat: from.lat, lng: from.lng },
    to: { stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng },
    durationSec: walkSecFromKm(stop.distanceKm),
    distanceMeters: Math.round(stop.distanceKm * 1000 * WALK_DETOUR),
    verified: false,
  };
}

export function buildEgressWalkLeg(stop: NearStop, to: LatLng & { label?: string }): WalkLeg {
  return {
    kind: "walk",
    from: { stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng },
    to: { name: to.label ?? "Destination", lat: to.lat, lng: to.lng },
    durationSec: walkSecFromKm(stop.distanceKm),
    distanceMeters: Math.round(stop.distanceKm * 1000 * WALK_DETOUR),
    verified: false,
  };
}

export function buildTransferWalkLeg(
  stopById: Map<string, MlStop>,
  fromId: string,
  toId: string,
): WalkLeg | null {
  const a = stopById.get(fromId);
  const b = stopById.get(toId);
  if (!a || !b) return null;
  const w = cheapTransferWalk(stopById, fromId, toId);
  if (!w) return null;
  return {
    kind: "walk",
    from: { stopId: a.id, name: a.name, lat: a.lat, lng: a.lng },
    to: { stopId: b.id, name: b.name, lat: b.lat, lng: b.lng },
    durationSec: w.sec,
    distanceMeters: w.meters,
    verified: false,
  };
}

export function buildRideLeg(
  stopById: Map<string, MlStop>,
  routeById: Map<string, MlRouteMeta>,
  trip: TripSlice,
  boardIdx: number,
  alightIdx: number,
): RideLeg {
  const board = trip.stops[boardIdx];
  const alight = trip.stops[alightIdx];
  const boardStop = stopById.get(board.stopId)!;
  const alightStop = stopById.get(alight.stopId)!;
  const meta = routeById.get(trip.routeId);
  return {
    kind: "ride",
    routeId: trip.routeId,
    routeShort: meta?.short ?? "?",
    routeLong: meta?.long ?? "Route",
    tripId: trip.tripId,
    live: true,
    board: {
      stopId: boardStop.id,
      name: boardStop.name,
      lat: boardStop.lat,
      lng: boardStop.lng,
      departureUnix: board.arrivalUnix,
    },
    alight: {
      stopId: alightStop.id,
      name: alightStop.name,
      lat: alightStop.lat,
      lng: alightStop.lng,
      arrivalUnix: alight.arrivalUnix,
    },
    stopCount: alightIdx - boardIdx,
    delaySec: board.delaySec,
  };
}

export function waitLegAt(stop: MlStop, durationSec: number): WaitLeg {
  return {
    kind: "wait",
    stopId: stop.id,
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    durationSec,
  };
}

// Itinerary assembly, scoring and ranking live next door; re-exported so
// callers keep a single import path into the planner primitives.
export * from "./multileg-rank";
