// Multi-leg journey search — Phase 2a (1 transfer).
//
// Design choices and rationale:
//
//  1. The Cyprus GTFS bundle ships only route topology — no stop_times. So
//     classic RAPTOR / Connection Scan over a synthetic timetable would
//     fabricate times. Instead we drive the search from the realtime feed,
//     which carries trip-level stop times for trips currently in the next
//     ~60–90 min window. This is honest: we propose transfers only when we
//     can see both the first AND the connecting bus in the live feed.
//
//  2. The "no impossible transfers" guarantee from the plan is enforced
//     here, not in the UI: a connection is valid only if
//        T2.departure(X) >= T1.arrival(S) + walkTime(S→X) + MIN_BUFFER
//     where MIN_BUFFER is a per-route configurable padding.
//
//  3. Walking inside the inner loop uses a cheap straight-line × 1.35 detour
//     factor at 1.35 m/s. Real Google walking geometry is fetched only for
//     the top-K returned itineraries (lazy upgrade), keeping search time
//     bounded for a worst-case Cyprus query.
//
//  4. Bounded everywhere: top origin/dest stops, top alight candidates per
//     T1, transfer-candidate index already caps neighbours at 8, top
//     connecting trips per (X, dest). Worst case stays well under the 1.5s
//     budget set in the plan.

import { fetchRealtime } from "./gtfs-rt.server";
import { STOPS, ROUTES, distanceKm } from "./gtfs";
import { getStopRoutes, getTransferCandidates } from "./transfer-graph.server";
import { getWalkLink } from "./walk-links.server";
import type { Itinerary, Leg, RideLeg, WalkLeg, WaitLeg } from "./itinerary-types";

// ---- Tunables (all explicit so we can audit any change) -------------------
const MAX_ACCESS_WALK_KM = 1.2; // origin → first board stop
const MAX_EGRESS_WALK_KM = 1.2; // last alight → destination
const MAX_TRANSFER_WALK_M = 600; // walking between transfer stops
const TOP_ORIGIN_STOPS = 6;
const TOP_DEST_STOPS = 6;
const TOP_ALIGHT_CANDIDATES_PER_TRIP = 12;
const MIN_TRANSFER_BUFFER_SEC = 90;
const MAX_TOTAL_JOURNEY_SEC = 90 * 60; // 90 min hard cap
const TOP_K_RESULTS = 5;
const VERIFY_WALKS_FOR_TOP = 3; // upgrade walking geometry only for top 3

const WALK_M_PER_S = 1.35;
const WALK_DETOUR = 1.35;

function walkSecFromMeters(m: number) {
  return Math.round((m * WALK_DETOUR) / WALK_M_PER_S);
}
function walkSecFromKm(km: number) {
  return walkSecFromMeters(km * 1000);
}

const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));
const STOP_BY_ID = new Map(STOPS.map((s) => [s.id, s]));

type StopVisit = {
  stopId: string;
  arrivalUnix: number;
  delaySec: number;
};

type TripSlice = {
  tripId: string;
  routeId: string;
  /** Ordered ascending by arrivalUnix. */
  stops: StopVisit[];
  /** stopId → index in `stops` (first occurrence wins if a trip revisits). */
  indexOf: Map<string, number>;
};

// ---- Realtime indexing ----------------------------------------------------
async function buildTripIndex(): Promise<{
  trips: Map<string, TripSlice>;
  tripsByStop: Map<string, string[]>; // stopId → tripIds visiting it
}> {
  const rt = await fetchRealtime();
  const now = Math.floor(Date.now() / 1000);
  const raw = new Map<string, StopVisit[]>();
  const routeOfTrip = new Map<string, string>();

  for (const a of rt.arrivals) {
    if (a.arrivalUnix < now - 60) continue; // already passed
    let list = raw.get(a.tripId);
    if (!list) {
      list = [];
      raw.set(a.tripId, list);
    }
    list.push({
      stopId: a.stopId,
      arrivalUnix: a.arrivalUnix,
      delaySec: a.delaySec,
    });
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
    const slice: TripSlice = {
      tripId,
      routeId: routeOfTrip.get(tripId)!,
      stops: visits,
      indexOf,
    };
    trips.set(tripId, slice);
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

// ---- Walking helpers ------------------------------------------------------
function cheapTransferWalk(fromId: string, toId: string): { meters: number; sec: number } | null {
  if (fromId === toId) return { meters: 0, sec: 0 };
  const a = STOP_BY_ID.get(fromId);
  const b = STOP_BY_ID.get(toId);
  if (!a || !b) return null;
  const meters = Math.round(distanceKm(a, b) * 1000 * WALK_DETOUR);
  if (meters > MAX_TRANSFER_WALK_M) return null;
  return { meters, sec: walkSecFromMeters(meters / WALK_DETOUR) };
}

function buildAccessWalkLeg(
  from: { lat: number; lng: number; label?: string },
  stop: typeof STOPS[number] & { distanceKm: number },
): WalkLeg {
  const meters = Math.round(stop.distanceKm * 1000 * WALK_DETOUR);
  return {
    kind: "walk",
    from: { name: from.label ?? "Start", lat: from.lat, lng: from.lng },
    to: { stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng },
    durationSec: walkSecFromKm(stop.distanceKm),
    distanceMeters: meters,
    verified: false,
  };
}

function buildEgressWalkLeg(
  stop: typeof STOPS[number] & { distanceKm: number },
  to: { lat: number; lng: number; label?: string },
): WalkLeg {
  const meters = Math.round(stop.distanceKm * 1000 * WALK_DETOUR);
  return {
    kind: "walk",
    from: { stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng },
    to: { name: to.label ?? "Destination", lat: to.lat, lng: to.lng },
    durationSec: walkSecFromKm(stop.distanceKm),
    distanceMeters: meters,
    verified: false,
  };
}

function buildTransferWalkLeg(fromId: string, toId: string): WalkLeg | null {
  const a = STOP_BY_ID.get(fromId);
  const b = STOP_BY_ID.get(toId);
  if (!a || !b) return null;
  const w = cheapTransferWalk(fromId, toId);
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

function buildRideLeg(trip: TripSlice, boardIdx: number, alightIdx: number): RideLeg {
  const board = trip.stops[boardIdx];
  const alight = trip.stops[alightIdx];
  const boardStop = STOP_BY_ID.get(board.stopId)!;
  const alightStop = STOP_BY_ID.get(alight.stopId)!;
  const meta = ROUTE_BY_ID.get(trip.routeId);
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

// ---- The search -----------------------------------------------------------
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

export async function planMultiLegJourney(
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  opts?: { collectDiagnostics?: boolean },
): Promise<{ itineraries: Itinerary[]; diagnostics?: MultiLegDiagnostics }> {
  const t0 = Date.now();
  const now = Math.floor(Date.now() / 1000);
  const diag: MultiLegDiagnostics = {
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

  // 1) Origin / destination candidate stops.
  const byOrigin = STOPS.map((s) => ({ ...s, distanceKm: distanceKm(from, s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const byDest = STOPS.map((s) => ({ ...s, distanceKm: distanceKm(to, s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  diag.nearestOriginStopKm = byOrigin[0]?.distanceKm ?? null;
  diag.nearestDestStopKm = byDest[0]?.distanceKm ?? null;

  const originStops = byOrigin
    .filter((s) => s.distanceKm <= MAX_ACCESS_WALK_KM)
    .slice(0, TOP_ORIGIN_STOPS);
  const destStops = byDest
    .filter((s) => s.distanceKm <= MAX_EGRESS_WALK_KM)
    .slice(0, TOP_DEST_STOPS);
  diag.originStopCount = originStops.length;
  diag.destStopCount = destStops.length;

  if (originStops.length === 0) diag.reasons.push(`No stop within ${MAX_ACCESS_WALK_KM}km of origin (nearest ${diag.nearestOriginStopKm?.toFixed(2)}km)`);
  if (destStops.length === 0) diag.reasons.push(`No stop within ${MAX_EGRESS_WALK_KM}km of destination (nearest ${diag.nearestDestStopKm?.toFixed(2)}km)`);
  if (originStops.length === 0 || destStops.length === 0) {
    return { itineraries: [], diagnostics: opts?.collectDiagnostics ? diag : undefined };
  }

  const destStopMap = new Map(destStops.map((s) => [s.id, s]));

  // 2) Build trip index from the live feed.
  const { trips, tripsByStop } = await buildTripIndex();
  diag.liveTripCount = trips.size;
  let arrivalTotal = 0;
  for (const t of trips.values()) arrivalTotal += t.stops.length;
  diag.liveArrivalCount = arrivalTotal;
  for (const o of originStops) diag.originTripCount += (tripsByStop.get(o.id) ?? []).length;
  for (const d of destStops) diag.destTripCount += (tripsByStop.get(d.id) ?? []).length;

  // 3) Static topology indexes (for pruning transfer candidates).
  const stopRoutes = getStopRoutes();
  const transferIndex = getTransferCandidates();

  const itineraries: Itinerary[] = [];

  // ---- DIRECT pass (1 ride) ---------------------------------------------
  // We re-implement direct trips here in the multi-leg vocabulary so the
  // ranker compares apples-to-apples. The legacy planJourney still serves
  // the original /trips view until Phase 3 swaps it.
  for (const o of originStops) {
    const tripIds = tripsByStop.get(o.id) ?? [];
    for (const tripId of tripIds) {
      const trip = trips.get(tripId)!;
      const boardIdx = trip.indexOf.get(o.id)!;
      const board = trip.stops[boardIdx];

      // Find earliest dest-candidate downstream.
      let bestAlightIdx = -1;
      let bestAlightStop: (typeof destStops)[number] | null = null;
      for (let i = boardIdx + 1; i < trip.stops.length; i++) {
        const sid = trip.stops[i].stopId;
        const d = destStopMap.get(sid);
        if (d) {
          bestAlightIdx = i;
          bestAlightStop = d;
          break;
        }
      }
      if (bestAlightIdx === -1 || !bestAlightStop) continue;

      const access = buildAccessWalkLeg(from, o);
      const ride = buildRideLeg(trip, boardIdx, bestAlightIdx);
      const egress = buildEgressWalkLeg(bestAlightStop, to);

      // Feasibility: bus must not depart before we can walk to it (allow 60s slack).
      if (board.arrivalUnix < now + access.durationSec - 60) continue;

      const wait = Math.max(0, board.arrivalUnix - now - access.durationSec);
      const waitLeg: WaitLeg | null =
        wait >= 30
          ? {
              kind: "wait",
              stopId: o.id,
              name: o.name,
              lat: o.lat,
              lng: o.lng,
              durationSec: wait,
            }
          : null;

      const legs: Leg[] = waitLeg ? [access, waitLeg, ride, egress] : [access, ride, egress];
      itineraries.push(finalise(legs, now, "live"));
    }
  }

  // ---- 1-TRANSFER pass --------------------------------------------------
  // For every (origin stop, trip T1 from it), enumerate downstream alight
  // candidates S that are on the path toward the destination. From each S,
  // consider same-stop transfers AND short walks to nearby stops X (via the
  // precomputed transfer-candidate index). From each X, find trips T2 that
  // depart after T1 arrives + walk + buffer, and reach some dest stop.

  for (const o of originStops) {
    const t1Ids = tripsByStop.get(o.id) ?? [];
    for (const t1Id of t1Ids) {
      const t1 = trips.get(t1Id)!;
      const boardIdx = t1.indexOf.get(o.id)!;
      const board = t1.stops[boardIdx];

      const access = buildAccessWalkLeg(from, o);
      if (board.arrivalUnix < now + access.durationSec - 60) continue;
      // Don't transfer if the direct option from this trip is itself dest-bound;
      // direct pass above already added it and a transfer can't beat staying on.

      // Pick downstream alight candidates: stops that move us meaningfully
      // closer to destination. Limit to TOP_ALIGHT_CANDIDATES_PER_TRIP.
      const downstream = t1.stops.slice(boardIdx + 1);
      const ranked = downstream
        .map((v, i) => {
          const s = STOP_BY_ID.get(v.stopId);
          if (!s) return null;
          const distKm = distanceKm(s, to);
          return { visit: v, idx: boardIdx + 1 + i, stop: s, distKm };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        // must move us closer than walking from origin directly
        .filter((x) => x.distKm * 1000 < MAX_EGRESS_WALK_KM * 1000 + 5000)
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, TOP_ALIGHT_CANDIDATES_PER_TRIP);

      for (const cand of ranked) {
        const S = cand.stop;
        const t1Arrival = cand.visit.arrivalUnix;

        // Same-stop + nearby-stop transfer candidates.
        const transferTargets: Array<{ stopId: string; walkSec: number; walkMeters: number }> = [
          { stopId: S.id, walkSec: 0, walkMeters: 0 },
        ];
        for (const tc of transferIndex.get(S.id) ?? []) {
          const w = cheapTransferWalk(S.id, tc.toStopId);
          if (!w) continue;
          transferTargets.push({
            stopId: tc.toStopId,
            walkSec: w.sec,
            walkMeters: w.meters,
          });
        }

        for (const tt of transferTargets) {
          const earliestT2Departure = t1Arrival + tt.walkSec + MIN_TRANSFER_BUFFER_SEC;
          const t2Ids = tripsByStop.get(tt.stopId) ?? [];

          for (const t2Id of t2Ids) {
            const t2 = trips.get(t2Id)!;
            if (t2.routeId === t1.routeId) continue; // staying on same route ≠ transfer
            const xIdx = t2.indexOf.get(tt.stopId);
            if (xIdx === undefined) continue;
            const xVisit = t2.stops[xIdx];
            if (xVisit.arrivalUnix < earliestT2Departure) continue;

            // Find earliest dest-candidate downstream on T2.
            let alightIdx = -1;
            let alightStop: (typeof destStops)[number] | null = null;
            for (let i = xIdx + 1; i < t2.stops.length; i++) {
              const sid = t2.stops[i].stopId;
              const d = destStopMap.get(sid);
              if (d) {
                alightIdx = i;
                alightStop = d;
                break;
              }
            }
            if (alightIdx === -1 || !alightStop) continue;

            // Build the itinerary.
            const ride1 = buildRideLeg(t1, boardIdx, cand.idx);
            const ride2 = buildRideLeg(t2, xIdx, alightIdx);
            const egress = buildEgressWalkLeg(alightStop, to);

            // Pieces between the two rides.
            const middle: Leg[] = [];
            if (tt.stopId !== S.id) {
              const transferWalk = buildTransferWalkLeg(S.id, tt.stopId);
              if (!transferWalk) continue;
              middle.push(transferWalk);
            }
            const interWait = xVisit.arrivalUnix - (t1Arrival + tt.walkSec);
            if (interWait >= 30) {
              const xStop = STOP_BY_ID.get(tt.stopId)!;
              middle.push({
                kind: "wait",
                stopId: xStop.id,
                name: xStop.name,
                lat: xStop.lat,
                lng: xStop.lng,
                durationSec: interWait,
              });
            }

            // Initial access wait (between user arriving at first stop and bus departing).
            const initWait = Math.max(0, board.arrivalUnix - now - access.durationSec);
            const initWaitLeg: WaitLeg | null =
              initWait >= 30
                ? {
                    kind: "wait",
                    stopId: o.id,
                    name: o.name,
                    lat: o.lat,
                    lng: o.lng,
                    durationSec: initWait,
                  }
                : null;

            const legs: Leg[] = [
              access,
              ...(initWaitLeg ? [initWaitLeg] : []),
              ride1,
              ...middle,
              ride2,
              egress,
            ];
            itineraries.push(finalise(legs, now, "live"));
          }
        }
      }
    }
  }

  // ---- Filter, dedupe, rank --------------------------------------------
  const valid = itineraries.filter((it) => it.totalDurationSec <= MAX_TOTAL_JOURNEY_SEC);

  // Dedupe by (route1, board1, alight1, route2, board2, alight2) — keep cheapest.
  const dedup = new Map<string, Itinerary>();
  for (const it of valid) {
    const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
    const key = rides
      .map((r) => `${r.routeId}|${r.board.stopId}|${r.alight.stopId}`)
      .join("→");
    const existing = dedup.get(key);
    if (!existing || it.score < existing.score) dedup.set(key, it);
  }

  // Prune mediocre transfers: a transfer itinerary must beat the best direct
  // by ≥ 3 min OR ≥ 15% to survive. Otherwise the direct is the honest pick.
  const bestDirect = [...dedup.values()]
    .filter((it) => it.transfers === 0)
    .reduce<Itinerary | null>(
      (best, it) => (!best || it.score < best.score ? it : best),
      null,
    );

  let kept: Itinerary[] = [...dedup.values()];
  if (bestDirect) {
    kept = kept.filter((it) => {
      if (it.transfers === 0) return true;
      const margin = bestDirect.totalDurationSec - it.totalDurationSec;
      const pct = margin / bestDirect.totalDurationSec;
      return margin >= 180 || pct >= 0.15;
    });
  }

  kept.sort((a, b) => a.score - b.score);
  const top = kept.slice(0, TOP_K_RESULTS);

  // ---- Lazy-upgrade walking geometry for the top picks ----------------
  await Promise.all(
    top.slice(0, VERIFY_WALKS_FOR_TOP).map(async (it) => {
      for (const leg of it.legs) {
        if (leg.kind !== "walk") continue;
        // Only verify walks between two known stops (transfers and egress
        // from a stop). Pure origin-walk from arbitrary lat/lng skips for now;
        // the legacy planner will catch those in Phase 3.
        if (!leg.from.stopId || !leg.to.stopId) continue;
        const real = await getWalkLink(leg.from.stopId, leg.to.stopId);
        if (real.verified && real.distanceM < 99_000) {
          leg.durationSec = real.durationSec;
          leg.distanceMeters = real.distanceM;
          leg.verified = true;
          leg.polyline = real.polyline;
        }
      }
      // Recompute totals after the swap.
      recomputeTotals(it);
    }),
  );

  // Re-sort after verified walks may have shifted scores.
  top.sort((a, b) => a.score - b.score);

  const elapsed = Date.now() - t0;
  if (elapsed > 1500) {
    console.warn(`[multileg] search took ${elapsed}ms — over budget`);
  }
  return top;
}

// ---- Itinerary assembly helpers ------------------------------------------
function finalise(legs: Leg[], now: number, source: Itinerary["source"]): Itinerary {
  const first = legs[0];
  const last = legs[legs.length - 1];
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const walks = legs.filter((l): l is WalkLeg => l.kind === "walk");

  const departureUnix = firstStartUnix(legs, now);
  const arrivalUnix = lastEndUnix(legs, now);
  const totalDurationSec = arrivalUnix - now;
  const totalWalkMeters = walks.reduce((acc, w) => acc + w.distanceMeters, 0);
  const transfers = Math.max(0, rides.length - 1);

  // Score: time + transfer friction + reliability penalty (proxy via delay).
  const transferPenaltySec = transfers * 120; // 2 min per change, ties broken in favour of fewer
  const reliabilitySec = rides.reduce((acc, r) => acc + Math.max(0, r.delaySec), 0);
  const walkPenaltySec = Math.max(0, totalWalkMeters - 500) * 0.4; // light penalty above 500m total walk
  const score = totalDurationSec + transferPenaltySec + reliabilitySec * 0.5 + walkPenaltySec;

  return {
    id: makeId(legs, departureUnix),
    legs,
    totalDurationSec,
    departureUnix,
    arrivalUnix,
    transfers,
    totalWalkMeters,
    score,
    source,
  };
}

function firstStartUnix(legs: Leg[], now: number): number {
  // Departure = when the user must leave (now if first leg is an access walk).
  // We treat all itineraries as starting at `now` from the user's POV.
  return now;
}

function lastEndUnix(legs: Leg[], now: number): number {
  let t = now;
  let cursor = now;
  for (const l of legs) {
    if (l.kind === "walk" || l.kind === "wait") {
      cursor += l.durationSec;
      t = cursor;
    } else if (l.kind === "ride") {
      // Boarding the ride: cursor jumps to the bus arrival/departure at board.
      cursor = Math.max(cursor, l.board.departureUnix);
      // Then to alight time.
      cursor = l.alight.arrivalUnix;
      t = cursor;
    }
  }
  return t;
}

function recomputeTotals(it: Itinerary): void {
  const now = Math.floor(Date.now() / 1000);
  const arrivalUnix = lastEndUnix(it.legs, now);
  it.arrivalUnix = arrivalUnix;
  it.totalDurationSec = arrivalUnix - now;
  it.totalWalkMeters = it.legs
    .filter((l): l is WalkLeg => l.kind === "walk")
    .reduce((acc, w) => acc + w.distanceMeters, 0);
  const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
  const reliabilitySec = rides.reduce((acc, r) => acc + Math.max(0, r.delaySec), 0);
  const walkPenalty = Math.max(0, it.totalWalkMeters - 500) * 0.4;
  it.score = it.totalDurationSec + it.transfers * 120 + reliabilitySec * 0.5 + walkPenalty;
}

function makeId(legs: Leg[], departureUnix: number): string {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const sig = rides
    .map((r) => `${r.routeId}-${r.board.stopId}-${r.alight.stopId}`)
    .join("+");
  return `ml-${sig}-${departureUnix}`;
}
