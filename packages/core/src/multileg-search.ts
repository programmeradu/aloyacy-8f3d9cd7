// Pure multi-leg (up to 1 transfer) journey search.
//
// Extracted from the server planner so the interesting parts — feasibility,
// scoring, dedupe, pruning — are testable without a network, GTFS bundle or
// Google walking API. The caller supplies the static topology (stops, route
// metadata, transfer candidates) and the live arrivals; this module does the
// rest and hands back itineraries plus diagnostics.
//
// Invariants enforced here (not in the UI):
//   T2.departure(X) >= T1.arrival(S) + walk(S→X) + MIN_TRANSFER_BUFFER_SEC
//   totalDuration <= MAX_TOTAL_JOURNEY_SEC
//   a transfer must beat the best direct by >= 3 min or >= 15%

import { distanceM } from "./geo";
import type { Itinerary, Leg, RideLeg, WalkLeg, WaitLeg } from "./itinerary-types";

// ---- Tunables (all explicit so we can audit any change) -------------------
export const MAX_ACCESS_WALK_KM = 2.0; // origin → first board stop
export const MAX_EGRESS_WALK_KM = 2.0; // last alight → destination (transfers)
export const MAX_DIRECT_EGRESS_WALK_KM = 3.0; // wider net for no-transfer rides
export const MAX_TRANSFER_WALK_M = 600; // walking between transfer stops
export const TOP_ORIGIN_STOPS = 6;
export const TOP_DEST_STOPS = 6;
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
  /** stopId → index in `stops` (first occurrence wins if a trip revisits). */
  indexOf: Map<string, number>;
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
    for (let i = 0; i < visits.length; i++) {
      if (!indexOf.has(visits[i].stopId)) indexOf.set(visits[i].stopId, i);
    }
    trips.set(tripId, { tripId, routeId: routeOfTrip.get(tripId)!, stops: visits, indexOf });
    for (const v of visits) {
      let bucket = tripsByStop.get(v.stopId);
      if (!bucket) {
        bucket = [];
        tripsByStop.set(v.stopId, bucket);
      }
      bucket.push(tripId);
    }
  }

  return { trips, tripsByStop };
}

// ---- Leg builders ---------------------------------------------------------
type NearStop = MlStop & { distanceKm: number };

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

function waitLegAt(stop: MlStop, durationSec: number): WaitLeg {
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

export function scoreItinerary(input: {
  totalDurationSec: number;
  transfers: number;
  totalWalkMeters: number;
  reliabilitySec: number;
}): number {
  const transferPenaltySec = input.transfers * 120; // 2 min per change
  const walkPenaltySec = Math.max(0, input.totalWalkMeters - 500) * 0.4;
  return input.totalDurationSec + transferPenaltySec + input.reliabilitySec * 0.5 + walkPenaltySec;
}

export function makeId(legs: Leg[], departureUnix: number): string {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const sig = rides.map((r) => `${r.routeId}-${r.board.stopId}-${r.alight.stopId}`).join("+");
  return `ml-${sig}-${departureUnix}`;
}

export function finalise(legs: Leg[], now: number, source: Itinerary["source"]): Itinerary {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const walks = legs.filter((l): l is WalkLeg => l.kind === "walk");

  // From the rider's point of view every itinerary starts now.
  const departureUnix = now;
  const arrivalUnix = lastEndUnix(legs, now);
  const totalDurationSec = arrivalUnix - now;
  const totalWalkMeters = walks.reduce((acc, w) => acc + w.distanceMeters, 0);
  const transfers = Math.max(0, rides.length - 1);
  const reliabilitySec = rides.reduce((acc, r) => acc + Math.max(0, r.delaySec), 0);

  return {
    id: makeId(legs, departureUnix),
    legs,
    totalDurationSec,
    departureUnix,
    arrivalUnix,
    transfers,
    totalWalkMeters,
    score: scoreItinerary({ totalDurationSec, transfers, totalWalkMeters, reliabilitySec }),
    source,
  };
}

/** Mutating refresh used after walking geometry is upgraded with real data. */
export function recomputeTotals(it: Itinerary, now: number): void {
  const arrivalUnix = lastEndUnix(it.legs, now);
  it.arrivalUnix = arrivalUnix;
  it.totalDurationSec = arrivalUnix - now;
  it.totalWalkMeters = it.legs
    .filter((l): l is WalkLeg => l.kind === "walk")
    .reduce((acc, w) => acc + w.distanceMeters, 0);
  const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
  const reliabilitySec = rides.reduce((acc, r) => acc + Math.max(0, r.delaySec), 0);
  it.score = scoreItinerary({
    totalDurationSec: it.totalDurationSec,
    transfers: it.transfers,
    totalWalkMeters: it.totalWalkMeters,
    reliabilitySec,
  });
}

// ---- Filter, dedupe, rank -------------------------------------------------
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

  // A transfer must beat the best direct by >= 3 min or >= 15%.
  const bestDirect = [...dedup.values()]
    .filter((it) => it.transfers === 0)
    .reduce<Itinerary | null>((best, it) => (!best || it.score < best.score ? it : best), null);

  let kept = [...dedup.values()];
  const beforePrune = kept.length;
  if (bestDirect) {
    kept = kept.filter((it) => {
      if (it.transfers === 0) return true;
      const margin = bestDirect.totalDurationSec - it.totalDurationSec;
      const pct = margin / bestDirect.totalDurationSec;
      return margin >= 180 || pct >= 0.15;
    });
  }
  diag.prunedMediocre = beforePrune - kept.length;

  kept.sort((a, b) => a.score - b.score);
  const top = kept.slice(0, TOP_K_RESULTS);
  diag.keptCount = top.length;
  return top;
}

// ---- The search -----------------------------------------------------------
export function searchMultiLeg(input: MultiLegInput): {
  itineraries: Itinerary[];
  diagnostics: MultiLegDiagnostics;
} {
  const { from, to, stops, routeById, arrivals, transferIndex, now } = input;
  const diag = emptyDiagnostics();
  const stopById = new Map(stops.map((s) => [s.id, s]));

  // 1) Origin / destination candidate stops.
  const byOrigin: NearStop[] = stops
    .map((s) => ({ ...s, distanceKm: distanceKm(from, s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const byDest: NearStop[] = stops
    .map((s) => ({ ...s, distanceKm: distanceKm(to, s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  diag.nearestOriginStopKm = byOrigin[0]?.distanceKm ?? null;
  diag.nearestDestStopKm = byDest[0]?.distanceKm ?? null;

  const originStops = byOrigin
    .filter((s) => s.distanceKm <= MAX_ACCESS_WALK_KM)
    .slice(0, TOP_ORIGIN_STOPS);
  const destStops = byDest
    .filter((s) => s.distanceKm <= MAX_EGRESS_WALK_KM)
    .slice(0, TOP_DEST_STOPS);
  // Wider set used ONLY by the direct pass, so a no-transfer ride that drops
  // you a longer walk away still surfaces as a choice.
  const directDestStops = byDest
    .filter((s) => s.distanceKm <= MAX_DIRECT_EGRESS_WALK_KM)
    .slice(0, TOP_DEST_STOPS + 4);
  diag.originStopCount = originStops.length;
  diag.destStopCount = destStops.length;

  if (originStops.length === 0)
    diag.reasons.push(
      `No stop within ${MAX_ACCESS_WALK_KM}km of origin (nearest ${diag.nearestOriginStopKm?.toFixed(2)}km)`,
    );
  if (destStops.length === 0 && directDestStops.length === 0)
    diag.reasons.push(
      `No stop within ${MAX_DIRECT_EGRESS_WALK_KM}km of destination (nearest ${diag.nearestDestStopKm?.toFixed(2)}km)`,
    );
  if (originStops.length === 0 || (destStops.length === 0 && directDestStops.length === 0)) {
    return { itineraries: [], diagnostics: diag };
  }

  const destStopMap = new Map(destStops.map((s) => [s.id, s]));
  const directDestStopMap = new Map(directDestStops.map((s) => [s.id, s]));

  // 2) Index the live feed.
  const { trips, tripsByStop } = buildTripIndex(arrivals, now);
  diag.liveTripCount = trips.size;
  for (const t of trips.values()) diag.liveArrivalCount += t.stops.length;
  for (const o of originStops) diag.originTripCount += (tripsByStop.get(o.id) ?? []).length;
  for (const d of destStops) diag.destTripCount += (tripsByStop.get(d.id) ?? []).length;

  const candidates: Itinerary[] = [];

  // ---- DIRECT pass (1 ride) ---------------------------------------------
  for (const o of originStops) {
    for (const tripId of tripsByStop.get(o.id) ?? []) {
      const trip = trips.get(tripId)!;
      const boardIdx = trip.indexOf.get(o.id)!;
      const board = trip.stops[boardIdx];

      let alightIdx = -1;
      let alightStop: NearStop | null = null;
      for (let i = boardIdx + 1; i < trip.stops.length; i++) {
        const d = directDestStopMap.get(trip.stops[i].stopId);
        if (d) {
          alightIdx = i;
          alightStop = d;
          break;
        }
      }
      if (alightIdx === -1 || !alightStop) continue;

      const access = buildAccessWalkLeg(from, o);
      // Feasibility: the bus must not leave before we can reach it (60s slack).
      if (board.arrivalUnix < now + access.durationSec - 60) continue;

      const ride = buildRideLeg(stopById, routeById, trip, boardIdx, alightIdx);
      const egress = buildEgressWalkLeg(alightStop, to);
      const wait = Math.max(0, board.arrivalUnix - now - access.durationSec);
      const legs: Leg[] =
        wait >= 30 ? [access, waitLegAt(o, wait), ride, egress] : [access, ride, egress];

      candidates.push(finalise(legs, now, "live"));
      diag.directRawCount++;
    }
  }

  // ---- 1-TRANSFER pass --------------------------------------------------
  for (const o of originStops) {
    for (const t1Id of tripsByStop.get(o.id) ?? []) {
      const t1 = trips.get(t1Id)!;
      const boardIdx = t1.indexOf.get(o.id)!;
      const board = t1.stops[boardIdx];

      const access = buildAccessWalkLeg(from, o);
      if (board.arrivalUnix < now + access.durationSec - 60) continue;

      // Downstream alight candidates that move us meaningfully closer.
      const ranked = t1.stops
        .slice(boardIdx + 1)
        .map((v, i) => {
          const s = stopById.get(v.stopId);
          if (!s) return null;
          return { visit: v, idx: boardIdx + 1 + i, stop: s, distKm: distanceKm(s, to) };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .filter((x) => x.distKm * 1000 < MAX_EGRESS_WALK_KM * 1000 + 5000)
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, TOP_ALIGHT_CANDIDATES_PER_TRIP);

      for (const cand of ranked) {
        const S = cand.stop;
        const t1Arrival = cand.visit.arrivalUnix;

        const transferTargets: Array<{ stopId: string; walkSec: number; walkMeters: number }> = [
          { stopId: S.id, walkSec: 0, walkMeters: 0 },
        ];
        for (const tc of transferIndex.get(S.id) ?? []) {
          const w = cheapTransferWalk(stopById, S.id, tc.toStopId);
          if (!w) continue;
          transferTargets.push({ stopId: tc.toStopId, walkSec: w.sec, walkMeters: w.meters });
        }

        for (const tt of transferTargets) {
          const earliestT2Departure = t1Arrival + tt.walkSec + MIN_TRANSFER_BUFFER_SEC;

          for (const t2Id of tripsByStop.get(tt.stopId) ?? []) {
            const t2 = trips.get(t2Id)!;
            if (t2.routeId === t1.routeId) continue; // same route ≠ a transfer
            const xIdx = t2.indexOf.get(tt.stopId);
            if (xIdx === undefined) continue;
            const xVisit = t2.stops[xIdx];
            if (xVisit.arrivalUnix < earliestT2Departure) continue;

            let alightIdx = -1;
            let alightStop: NearStop | null = null;
            for (let i = xIdx + 1; i < t2.stops.length; i++) {
              const d = destStopMap.get(t2.stops[i].stopId);
              if (d) {
                alightIdx = i;
                alightStop = d;
                break;
              }
            }
            if (alightIdx === -1 || !alightStop) continue;

            const ride1 = buildRideLeg(stopById, routeById, t1, boardIdx, cand.idx);
            const ride2 = buildRideLeg(stopById, routeById, t2, xIdx, alightIdx);
            const egress = buildEgressWalkLeg(alightStop, to);

            const middle: Leg[] = [];
            if (tt.stopId !== S.id) {
              const transferWalk = buildTransferWalkLeg(stopById, S.id, tt.stopId);
              if (!transferWalk) continue;
              middle.push(transferWalk);
            }
            const interWait = xVisit.arrivalUnix - (t1Arrival + tt.walkSec);
            if (interWait >= 30) {
              const xStop = stopById.get(tt.stopId)!;
              middle.push(waitLegAt(xStop, interWait));
            }

            const initWait = Math.max(0, board.arrivalUnix - now - access.durationSec);
            const legs: Leg[] = [
              access,
              ...(initWait >= 30 ? [waitLegAt(o, initWait)] : []),
              ride1,
              ...middle,
              ride2,
              egress,
            ];
            candidates.push(finalise(legs, now, "live"));
            diag.transferRawCount++;
          }
        }
      }
    }
  }

  return { itineraries: rankItineraries(candidates, diag), diagnostics: diag };
}
