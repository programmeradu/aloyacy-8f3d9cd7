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
import { filterDominated, scoreItinerary, type ChangeCost } from "./plan-score";

// ---- Tunables (all explicit so we can audit any change) -------------------
export const MAX_ACCESS_WALK_KM = 2.0; // origin → first board stop
export const MAX_EGRESS_WALK_KM = 2.0; // last alight → destination
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

/**
 * Facts the scorer needs that only the caller can supply: which stops belong
 * to the same station, and how often each route actually runs.
 */
export type PlanContext = {
  sameStation?: (aStopId: string, bStopId: string) => boolean;
  headwayOf?: (routeId: string) => number | null;
};

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

// ---- Itinerary assembly ---------------------------------------------------
export function lastEndUnix(legs: Leg[], now: number): number {
  let t = now;
  let cursor = now;
  for (const l of legs) {
    if (l.kind === "walk" || l.kind === "wait") {
      cursor += l.durationSec;
      t = cursor;
    } else if (l.kind === "ride") {
      cursor = Math.max(cursor, l.board.departureUnix);
      cursor = l.alight.arrivalUnix;
      t = cursor;
    }
  }
  return t;
}

/**
 * Describe every change in a leg sequence using measured facts: how far the
 * rider physically moves between the two buses, whether that move stays inside
 * one station, and how often the route being joined actually runs.
 */
export function describeChanges(legs: Leg[], ctx?: PlanContext): ChangeCost[] {
  const out: ChangeCost[] = [];
  let pendingAlight: RideLeg | null = null;
  let interchangeSec = 0;

  for (const leg of legs) {
    if (leg.kind === "ride") {
      if (pendingAlight) {
        const a = pendingAlight.alight.stopId;
        const b = leg.board.stopId;
        out.push({
          interchangeSec,
          headwaySec: ctx?.headwayOf?.(leg.routeId) ?? null,
          sameStation: a === b || (ctx?.sameStation?.(a, b) ?? false),
        });
      }
      pendingAlight = leg;
      interchangeSec = 0;
    } else if (leg.kind === "walk" && pendingAlight) {
      interchangeSec += leg.durationSec;
    }
  }
  return out;
}

/**
 * Split walking into street walking and bay-to-bay hops inside one station.
 * A hop across a terminal forecourt is not the same burden as 300 m of
 * pavement, and the scorer prices them differently.
 */
export function walkBreakdown(
  legs: Leg[],
  ctx?: PlanContext,
): { streetMeters: number; inStationMeters: number } {
  let streetMeters = 0;
  let inStationMeters = 0;
  for (const leg of legs) {
    if (leg.kind !== "walk") continue;
    const a = leg.from.stopId;
    const b = leg.to.stopId;
    const hop = a !== undefined && b !== undefined && (a === b || (ctx?.sameStation?.(a, b) ?? false));
    if (hop) inStationMeters += leg.distanceMeters;
    else streetMeters += leg.distanceMeters;
  }
  return { streetMeters, inStationMeters };
}

/** Score a leg sequence with the one shared cost model. */
export function scoreLegs(legs: Leg[], totalDurationSec: number, ctx?: PlanContext): number {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const { streetMeters, inStationMeters } = walkBreakdown(legs, ctx);
  return scoreItinerary({
    totalDurationSec,
    walkMeters: streetMeters,
    inStationHopMeters: inStationMeters,
    changes: describeChanges(legs, ctx),
    reliabilitySec: rides.reduce((acc, r) => acc + Math.max(0, r.delaySec), 0),
  });
}

export function makeId(legs: Leg[], departureUnix: number): string {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const sig = rides.map((r) => `${r.routeId}-${r.board.stopId}-${r.alight.stopId}`).join("+");
  return `ml-${sig}-${departureUnix}`;
}

export function finalise(
  legs: Leg[],
  now: number,
  source: Itinerary["source"],
  ctx?: PlanContext,
): Itinerary {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const walks = legs.filter((l): l is WalkLeg => l.kind === "walk");

  // From the rider's point of view every itinerary starts now.
  const departureUnix = now;
  const arrivalUnix = lastEndUnix(legs, now);
  const totalDurationSec = arrivalUnix - now;
  const totalWalkMeters = walks.reduce((acc, w) => acc + w.distanceMeters, 0);
  const transfers = Math.max(0, rides.length - 1);

  return {
    id: makeId(legs, departureUnix),
    legs,
    totalDurationSec,
    departureUnix,
    arrivalUnix,
    transfers,
    totalWalkMeters,
    score: scoreLegs(legs, totalDurationSec, ctx),
    source,
  };
}

/** Mutating refresh used after walking geometry is upgraded with real data. */
export function recomputeTotals(it: Itinerary, now: number, ctx?: PlanContext): void {
  const arrivalUnix = lastEndUnix(it.legs, now);
  it.arrivalUnix = arrivalUnix;
  it.totalDurationSec = arrivalUnix - now;
  it.totalWalkMeters = it.legs
    .filter((l): l is WalkLeg => l.kind === "walk")
    .reduce((acc, w) => acc + w.distanceMeters, 0);
  it.score = scoreLegs(it.legs, it.totalDurationSec, ctx);
}

// ---- Filter, dedupe, rank -------------------------------------------------
/**
 * Drop only options another option beats outright — earlier (or equally
 * early), with no more changes and no more walking. A direct ride survives
 * because nothing beats it, not because transfers were forbidden; a change
 * that genuinely gets you there sooner survives too, and is priced honestly
 * by the scorer.
 */
export function pruneDominated(itineraries: Itinerary[]): Itinerary[] {
  return filterDominated(itineraries);
}


export function rankItineraries(candidates: Itinerary[], diag: MultiLegDiagnostics): Itinerary[] {
  const valid = candidates.filter((it) => it.totalDurationSec <= MAX_TOTAL_JOURNEY_SEC);
  diag.validCount = valid.length;

  if (candidates.length > 0 && valid.length === 0) {
    const min = Math.min(...candidates.map((it) => it.totalDurationSec));
    diag.reasons.push(
      `All ${candidates.length} candidates exceed ${Math.round(MAX_TOTAL_JOURNEY_SEC / 60)}min cap (shortest: ${Math.round(min / 60)}min)`,
    );
  }
  if (candidates.length === 0) {
    if (diag.originTripCount === 0)
      diag.reasons.push(`No live trips visible at any origin stop (feed window is ~60min)`);
    else if (diag.destTripCount === 0)
      diag.reasons.push(`No live trips visible reaching any destination stop`);
    else
      diag.reasons.push(
        `Origin and dest both have live trips, but no single-trip or 1-transfer path connects them in the feed window`,
      );
  }

  // Dedupe by ride signature — keep the cheapest.
  const dedup = new Map<string, Itinerary>();
  for (const it of valid) {
    const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
    const key = rides.map((r) => `${r.routeId}|${r.board.stopId}|${r.alight.stopId}`).join("→");
    const existing = dedup.get(key);
    if (!existing || it.score < existing.score) dedup.set(key, it);
  }

  let kept = [...dedup.values()];
  const beforePrune = kept.length;
  kept = applyDirectPreference(kept);
  diag.prunedMediocre = beforePrune - kept.length;

  kept.sort((a, b) => a.score - b.score);
  const top = kept.slice(0, TOP_K_RESULTS);
  diag.keptCount = top.length;
  return top;
}
