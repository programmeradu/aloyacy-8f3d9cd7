// Pure multi-leg (up to 1 transfer) journey search.
//
// Extracted from the server planner so the interesting parts — feasibility,
// scoring, dedupe, pruning — are testable without a network, GTFS bundle or
// Google walking API. The caller supplies the static topology (stops, route
// metadata, transfer candidates, the station index) and the live arrivals;
// this module does the rest and hands back itineraries plus diagnostics.
//
// Invariants enforced here (not in the UI):
//   T2.departure(X) >= T1.arrival(S) + walk(S→X) + MIN_TRANSFER_BUFFER_SEC
//   totalDuration <= MAX_TOTAL_JOURNEY_SEC
//   an option is dropped only when another option beats it on arrival,
//   changes and walking at once — never because it has (or lacks) a change.

import type { Itinerary, Leg } from "./itinerary-types";
import { selectCandidateStops } from "./plan-candidates";
import {
  MAX_ACCESS_WALK_KM,
  MAX_DEST_CANDIDATES,
  MAX_EGRESS_WALK_KM,
  MAX_ORIGIN_CANDIDATES,
  MIN_TRANSFER_BUFFER_SEC,
  TOP_ALIGHT_CANDIDATES_PER_TRIP,
  TOP_DEST_STOPS,
  TOP_ORIGIN_STOPS,
  buildAccessWalkLeg,
  buildEgressWalkLeg,
  buildRideLeg,
  buildTransferWalkLeg,
  buildTripIndex,
  cheapTransferWalk,
  distanceKm,
  emptyDiagnostics,
  finalise,
  rankItineraries,
  waitLegAt,
  type MultiLegDiagnostics,
  type MultiLegInput,
  type NearStop,
  type PlanContext,
} from "./multileg-legs";

// Re-exported so callers only need one import path.
export * from "./multileg-legs";

// ---- The search -----------------------------------------------------------
export function searchMultiLeg(input: MultiLegInput): {
  itineraries: Itinerary[];
  diagnostics: MultiLegDiagnostics;
} {
  const { from, to, stops, routeById, arrivals, transferIndex, now } = input;
  const diag = emptyDiagnostics();
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const ctx: PlanContext = { sameStation: input.sameStation, headwayOf: input.headwayOf };

  // 1) Index the live feed first — candidate selection needs to know which
  //    routes each stop actually offers.
  const { trips, tripsByStop } = buildTripIndex(arrivals, now);
  diag.liveTripCount = trips.size;
  for (const t of trips.values()) diag.liveArrivalCount += t.stops.length;

  const routesAt = (stopId: string): Set<string> => {
    const out = new Set<string>();
    for (const tripId of tripsByStop.get(stopId) ?? []) {
      const t = trips.get(tripId);
      if (t) out.add(t.routeId);
    }
    return out;
  };

  // 2) Origin / destination candidates: nearest-N, plus any stop that adds a
  //    bay of a station we already picked or a route we do not yet have.
  const entries: Array<[string, (typeof stops)[number]]> = stops.map((s) => [s.id, s]);
  const stationOf = input.sameStation
    ? (id: string) => input.stationIdOf?.(id) ?? id
    : undefined;

  const originPick = selectCandidateStops({
    stops: entries,
    point: from,
    maxKm: MAX_ACCESS_WALK_KM,
    minCount: TOP_ORIGIN_STOPS,
    hardCap: MAX_ORIGIN_CANDIDATES,
    distanceKm,
    stationOf,
    routesAt: (id) => routesAt(id),
  });
  const destPick = selectCandidateStops({
    stops: entries,
    point: to,
    maxKm: MAX_EGRESS_WALK_KM,
    minCount: TOP_DEST_STOPS,
    hardCap: MAX_DEST_CANDIDATES,
    distanceKm,
    stationOf,
    routesAt: (id) => routesAt(id),
  });

  const originStops: NearStop[] = originPick.candidates.map((c) => ({
    ...c.stop,
    distanceKm: c.distKm,
  }));
  const destStops: NearStop[] = destPick.candidates.map((c) => ({
    ...c.stop,
    distanceKm: c.distKm,
  }));

  diag.nearestOriginStopKm = originPick.nearestKm;
  diag.nearestDestStopKm = destPick.nearestKm;
  diag.originStopCount = originStops.length;
  diag.destStopCount = destStops.length;

  if (originStops.length === 0)
    diag.reasons.push(
      `No stop within ${MAX_ACCESS_WALK_KM}km of origin (nearest ${diag.nearestOriginStopKm?.toFixed(2)}km)`,
    );
  if (destStops.length === 0)
    diag.reasons.push(
      `No stop within ${MAX_EGRESS_WALK_KM}km of destination (nearest ${diag.nearestDestStopKm?.toFixed(2)}km)`,
    );
  if (originStops.length === 0 || destStops.length === 0) {
    return { itineraries: [], diagnostics: diag };
  }

  const destStopMap = new Map(destStops.map((s) => [s.id, s]));

  for (const o of originStops) diag.originTripCount += (tripsByStop.get(o.id) ?? []).length;
  for (const d of destStops) diag.destTripCount += (tripsByStop.get(d.id) ?? []).length;

  const candidates: Itinerary[] = [];

  // ---- DIRECT pass (1 ride) ---------------------------------------------
  for (const o of originStops) {
    for (const tripId of tripsByStop.get(o.id) ?? []) {
      const trip = trips.get(tripId)!;
      // Circular routes can visit a stop more than once. The first visit may
      // already have passed while a later lap is still boardable, so choose
      // the first occurrence the rider can physically reach.
      const access = buildAccessWalkLeg(from, o);
      const boardIdx = (trip.indicesOf.get(o.id) ?? []).find(
        (idx) => trip.stops[idx].arrivalUnix >= now + access.durationSec - 60,
      );
      if (boardIdx === undefined) continue;
      const board = trip.stops[boardIdx];

      let alightIdx = -1;
      let alightStop: NearStop | null = null;
      for (let i = boardIdx + 1; i < trip.stops.length; i++) {
        const d = destStopMap.get(trip.stops[i].stopId);
        if (d) {
          alightIdx = i;
          alightStop = d;
          break;
        }
      }
      if (alightIdx === -1 || !alightStop) continue;

      // Feasibility: the bus must not leave before we can reach it (60s slack).
      if (board.arrivalUnix < now + access.durationSec - 60) continue;

      const ride = buildRideLeg(stopById, routeById, trip, boardIdx, alightIdx);
      const egress = buildEgressWalkLeg(alightStop, to);
      const wait = Math.max(0, board.arrivalUnix - now - access.durationSec);
      const legs: Leg[] =
        wait >= 30 ? [access, waitLegAt(o, wait), ride, egress] : [access, ride, egress];

      candidates.push(finalise(legs, now, "live", ctx));
      diag.directRawCount++;
    }
  }

  // ---- 1-TRANSFER pass --------------------------------------------------
  for (const o of originStops) {
    for (const t1Id of tripsByStop.get(o.id) ?? []) {
      const t1 = trips.get(t1Id)!;
      const access = buildAccessWalkLeg(from, o);
      const boardIdx = (t1.indicesOf.get(o.id) ?? []).find(
        (idx) => t1.stops[idx].arrivalUnix >= now + access.durationSec - 60,
      );
      if (boardIdx === undefined) continue;
      const board = t1.stops[boardIdx];

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
            candidates.push(finalise(legs, now, "live", ctx));
            diag.transferRawCount++;
          }
        }
      }
    }
  }

  return { itineraries: rankItineraries(candidates, diag), diagnostics: diag };
}
