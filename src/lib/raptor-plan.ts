// Schedule-based bounded RAPTOR for Cyprus.
// Inputs: origin/dest lat-lng + a departure time (unix sec).
// Output: up to N Itinerary DTOs matching `itinerary-types` shape.
// Max MAX_ROUNDS rounds, earliest arrival tracked per stop, walk transfers capped at MAX_TRANSFER_WALK_M.

import type { LoadedSchedule, ScheduleStop } from "./schedule-types";
import { serviceDateToUnix } from "./schedule-types";
import type { Itinerary, Leg } from "./itinerary-types";
import {
  RAPTOR_TUNING,
  buildSpatialBuckets,
  finalise,
  nearbyStops,
  nearestStops,
  walkMetersOnStreet,
  walkSecFromMeters,
} from "@aloya/core/raptor-core";
import { buildDirectRaptorItineraries, selectRaptorItineraries } from "./raptor-direct";
import { reconstruct, type Label, type RideLabel } from "./raptor-reconstruct";
import { selectCandidateStops } from "@aloya/core/plan-candidates";
import { distanceKm } from "@aloya/core/multileg-legs";
import { buildHeadwayIndex } from "@aloya/core/headway";
import { sameStation, stationIdOf } from "./stations";
import type { PlanContext, AccessibilityPrefs, WalkQuality } from "@aloya/core/raptor-core";
import { WALK_QUALITY_PENALTY } from "@aloya/core/raptor-core";
import { skipMapKey } from "@aloya/core/skip-rate";

/** Server-side signals the search uses when it runs on the Worker. The
 *  browser planner runs without them (haversine walks, no skip data). */
type WalkQualityRow = { reachableOnFoot?: string | null };
type WalkLinkRow = { durationSec: number; distanceM: number };
export type RaptorDeps = {
  loadSkipFractionMap?: (stopIds: string[]) => Promise<Map<string, number>>;
  loadStopWalkQuality?: (stopIds: string[]) => Promise<Map<string, WalkQualityRow>>;
  loadVerifiedWalkLinks?: (stopIds: string[]) => Promise<Map<string, WalkLinkRow>>;
};

// Headways are a property of the schedule shard, not of one request, so they
// are measured once per loaded shard and reused for every plan that day.
const headwayCache = new WeakMap<LoadedSchedule, Map<string, number>>();

function headwayIndexFor(schedule: LoadedSchedule): Map<string, number> {
  const cached = headwayCache.get(schedule);
  if (cached) return cached;
  const samples: Array<{ routeId: string; stopId: string; timeUnix: number }> = [];
  for (const [stopId, rows] of Object.entries(schedule.stopTrips)) {
    for (const row of rows) samples.push({ routeId: row[2], stopId, timeUnix: row[1] });
  }
  const index = buildHeadwayIndex(samples);
  headwayCache.set(schedule, index);
  return index;
}

// Cross-island journeys can legitimately require a local feeder, an intercity service,
// and airport-side connections. Keep the search bounded, but allow the full network.
const {
  maxRounds: MAX_ROUNDS, maxAccessWalkKm: MAX_ACCESS_WALK_KM, maxEgressWalkKm: MAX_EGRESS_WALK_KM,
  maxDirectEgressWalkKm: MAX_DIRECT_EGRESS_WALK_KM, maxTransferWalkM: MAX_TRANSFER_WALK_M,
  topOriginStops: TOP_ORIGIN_STOPS, topDestStops: TOP_DEST_STOPS,
  maxOriginCandidates: MAX_ORIGIN_CANDIDATES, maxDestCandidates: MAX_DEST_CANDIDATES,
  minTransferBufferSec: MIN_TRANSFER_BUFFER_SEC, maxTotalJourneySec: MAX_TOTAL_JOURNEY_SEC,
  topKResults: TOP_K_RESULTS, defaultSearchHorizonSec: DEFAULT_SEARCH_HORIZON_SEC,
} = RAPTOR_TUNING;


export type RaptorDiagnostics = {
  date: string;
  scheduleStopsLoaded: number;
  scheduleTripsLoaded: number;
  originStopCount: number;
  destStopCount: number;
  nearestOriginStopKm: number | null;
  nearestDestStopKm: number | null;
  roundsRun: number;
  scannedTrips: number;
  walkTransfers: number;
  candidateItineraries: number;
  reasons: string[];
};

export async function planRaptor(
  schedule: LoadedSchedule,
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  departureUnix: number,
  opts?: {
    searchHorizonSec?: number;
    maxJourneySec?: number;
    accessibilityPrefs?: AccessibilityPrefs;
    deps?: RaptorDeps;
  },
): Promise<{ itineraries: Itinerary[]; diagnostics: RaptorDiagnostics }> {
  const deps: RaptorDeps = opts?.deps ?? {};
  const SEARCH_HORIZON_SEC = opts?.searchHorizonSec ?? DEFAULT_SEARCH_HORIZON_SEC;
  // The journey cap is measured from the requested departure, so a long wait
  // for the first bus (overnight, Sundays, holidays) eats into it. When the
  // caller widens the horizon it must widen this too, otherwise "first bus
  // tomorrow morning" gets pruned before it is ever scored.
  const MAX_JOURNEY_SEC = opts?.maxJourneySec ?? MAX_TOTAL_JOURNEY_SEC;
  const { date, stops, trips, stopTrips, stopTimes } = schedule;
  const diag: RaptorDiagnostics = {
    date,
    scheduleStopsLoaded: Object.keys(stops).length,
    scheduleTripsLoaded: Object.keys(trips).length,
    originStopCount: 0,
    destStopCount: 0,
    nearestOriginStopKm: null,
    nearestDestStopKm: null,
    roundsRun: 0,
    scannedTrips: 0,
    walkTransfers: 0,
    candidateItineraries: 0,
    reasons: [],
  };

  // Measured service frequency for this service date, cached per shard: what
  // a change costs depends on how long the next bus on that route really is.
  const headways = headwayIndexFor(schedule);

  // 1) Pick origin / destination candidate stops from the schedule's stop set.
  const stopList = Object.entries(stops); // [id, stop][]

  // Which routes each stop actually offers, straight from the schedule shard.
  // A stop earns a place in the candidate set by adding a route the set does
  // not have yet — that is how the far bay of a terminal stops being invisible.
  const routesAtStop = (id: string): string[] => {
    const rows = stopTrips[id];
    if (!rows) return [];
    const out = new Set<string>();
    for (const row of rows) out.add(row[2]);
    return [...out];
  };
  const stationOf = (id: string) => stationIdOf(id) ?? id;
  const pickKm = distanceKm;

  const originPick = selectCandidateStops({
    stops: stopList,
    point: from,
    maxKm: MAX_ACCESS_WALK_KM,
    minCount: TOP_ORIGIN_STOPS,
    hardCap: MAX_ORIGIN_CANDIDATES,
    distanceKm: pickKm,
    stationOf,
    routesAt: (id) => routesAtStop(id),
  });
  const destPick = selectCandidateStops({
    stops: stopList,
    point: to,
    maxKm: MAX_DIRECT_EGRESS_WALK_KM,
    minCount: TOP_DEST_STOPS,
    hardCap: MAX_DEST_CANDIDATES,
    distanceKm: pickKm,
    stationOf,
    routesAt: (id) => routesAtStop(id),
  });

  const origins = originPick.candidates;
  // One destination set for every option. Nothing gets a wider walking radius
  // because of how many changes it has.
  const dests = destPick.candidates;
  const directDests = destPick.candidates;
  diag.originStopCount = origins.length;
  diag.destStopCount = Math.max(dests.length, directDests.length);
  diag.nearestOriginStopKm = origins[0]?.distKm ?? null;
  diag.nearestDestStopKm = dests[0]?.distKm ?? null;
  if (origins.length === 0)
    diag.reasons.push(`No schedule stop within ${MAX_ACCESS_WALK_KM}km of origin`);
  if (dests.length === 0 && directDests.length === 0)
    diag.reasons.push(`No schedule stop within ${MAX_DIRECT_EGRESS_WALK_KM}km of destination`);
  if (origins.length === 0 || (dests.length === 0 && directDests.length === 0))
    return { itineraries: [], diagnostics: diag };

  const skipMap = await (deps.loadSkipFractionMap ?? (async () => new Map<string, number>()))(
    origins.map((o) => o.id),
  ).catch(
    () => new Map<string, number>(),
  );
  const planContext: PlanContext = {
    sameStation,
    headwayOf: (routeId) => headways.get(routeId) ?? null,
    skipOf: (stopId, routeId) => skipMap.get(skipMapKey(stopId, routeId)) ?? null,
  };

  const destSet = new Map<string, { stop: ScheduleStop; id: string; distKm: number }>();
  for (const d of dests) destSet.set(d.id, { id: d.id, stop: d.stop, distKm: d.distKm });

  // Spatial bucket index for nearby-stop lookups (cheap walk transfers).
  // Bucket by 0.005° (~500m at Cyprus); a stop and its neighbours fall in
  // at most 9 buckets. Built once per request from the in-memory stops map.
  const buckets = buildSpatialBuckets(stops);

  // A4 + D3: Pre-fetch stop walkability attributes and verified links for the active candidate set.
  // We fetch walk quality for all schedule stops since they're heavily cached and small.
  // (Alternatively, we could lazy-load or load just the candidate set, but this runs in a Worker 
  // so we prefer a single batched read).
  const candidateStopIds = Object.keys(stops);
  const [stopWalkQuality, walkLinkCache] = await Promise.all([
    deps.loadStopWalkQuality
      ? deps.loadStopWalkQuality(candidateStopIds).catch(() => new Map<string, WalkQualityRow>())
      : Promise.resolve(new Map<string, WalkQualityRow>()),
    deps.loadVerifiedWalkLinks
      ? deps.loadVerifiedWalkLinks(candidateStopIds).catch(() => new Map<string, WalkLinkRow>())
      : Promise.resolve(new Map<string, WalkLinkRow>()),
  ]);

  // 2) Round 0 — access walks from origin.
  // labels[round]: Map<stopId, Label>. We keep round-specific labels so
  // round k+1 only extends frontier stops reached in round k.
  const labels: Array<Map<string, Label>> = [new Map()];
  const bestArrival = new Map<string, number>(); // global best across rounds

  for (const o of origins) {
    const walkSec = walkSecFromMeters(o.distKm * 1000);
    const arr = departureUnix + walkSec;
    labels[0].set(o.id, {
      kind: "access",
      arrivalUnix: arr,
      meters: walkMetersOnStreet(o.distKm * 1000),
    });
    bestArrival.set(o.id, arr);
  }
  if (origins.every((origin) => !stopTrips[origin.id]?.length)) {
    diag.reasons.push("Nearby origin stops have no scheduled departures in this service shard");
  }

  // 3) Rounds 1..MAX_ROUNDS — ride + walking transfer.
  for (let k = 1; k <= MAX_ROUNDS; k++) {
    const prev = labels[k - 1];
    if (prev.size === 0) break;
    const next = new Map<string, Label>();

    // Track which stops were touched this round so we can apply walking
    // transfers afterwards.
    const touched = new Set<string>();

    for (const [stopId, label] of prev) {
      const departReady = label.arrivalUnix + (k === 1 ? 0 : MIN_TRANSFER_BUFFER_SEC);
      if (departReady - departureUnix > SEARCH_HORIZON_SEC) continue;
      const trips = stopTrips[stopId];
      if (!trips) continue;

      // Find earliest trip in the sorted array via binary search on depSec.
      // depSec is seconds-since-service-midnight; convert our deadline back.
      const deadlineSec = unixToServiceSec(date, departReady);

      // Binary search for first trip with depSec >= deadlineSec.
      let lo = 0;
      let hi = trips.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (trips[mid][1] < deadlineSec) lo = mid + 1;
        else hi = mid;
      }

      for (let i = lo; i < trips.length; i++) {
        const [tripId, depSec] = trips[i];
        if (depSec - deadlineSec > SEARCH_HORIZON_SEC) break;
        // Don't re-board the same trip we just got off.
        if (label.kind === "ride" && label.tripId === tripId) continue;
        const tripSt = stopTimes[tripId];
        if (!tripSt) continue;
        diag.scannedTrips++;

        // Find board index on this trip.
        let boardIdx = -1;
        for (let j = 0; j < tripSt.length; j++) {
          if (tripSt[j][0] === stopId && tripSt[j][1] >= deadlineSec) {
            boardIdx = j;
            break;
          }
        }
        if (boardIdx < 0) continue;

        // Walk downstream and mark new arrivals.
        for (let j = boardIdx + 1; j < tripSt.length; j++) {
          const [sid, , arrSec, seq] = tripSt[j];
          const arrUnix = serviceDateToUnix(date, arrSec);
          if (arrUnix - departureUnix > MAX_JOURNEY_SEC) break;
          const existing = bestArrival.get(sid);
          if (existing !== undefined && arrUnix >= existing) continue;
          const tripMeta = trips[i];
          const label: RideLabel = {
            kind: "ride",
            arrivalUnix: arrUnix,
            prevStopId: stopId,
            prevArrivalUnix: prev.get(stopId)!.arrivalUnix,
            tripId,
            routeId: tripMeta[2],
            boardSeq: tripSt[boardIdx][3],
            alightSeq: seq,
          };
          next.set(sid, label);
          bestArrival.set(sid, arrUnix);
          touched.add(sid);
        }
      }
    }

    // Walking transfers between freshly-touched stops and nearby stops.
    const prefs = opts?.accessibilityPrefs;
    const excludeSet = new Set<string>();
    
    // We can pre-filter nearbyStops using the exclude set based on preferences.
    // If prefs require safe crossing, exclude "no_crossing" stops.
    // Always exclude "no_sidewalk" stops (hard exclude).
    if (prefs?.requireSafeCrossing) {
      for (const [sid, q] of stopWalkQuality.entries()) {
        if (q.reachableOnFoot === "no_crossing" || q.reachableOnFoot === "no_sidewalk") {
          excludeSet.add(sid);
        }
      }
    } else {
      for (const [sid, q] of stopWalkQuality.entries()) {
        if (q.reachableOnFoot === "no_sidewalk") {
          excludeSet.add(sid);
        }
      }
    }

    for (const sid of touched) {
      const cur = next.get(sid);
      if (!cur) continue;
      const stop = stops[sid];
      if (!stop) continue;
      
      const near = nearbyStops(buckets, stops, stop, MAX_TRANSFER_WALK_M, excludeSet);
      for (const [nid, ndistM] of near) {
        if (nid === sid) continue;
        
        let walkSec: number;
        const linkKey = `${sid}|${nid}`;
        const verified = walkLinkCache.get(linkKey);
        
        if (verified) {
          walkSec = verified.durationSec;
        } else {
          // No verified link, fall back to haversine + penalty
          const q = stopWalkQuality.get(nid);
          const wq: WalkQuality = q?.reachableOnFoot === "no_crossing" ? "no_crossing" : "unknown";
          const penalty = WALK_QUALITY_PENALTY[wq];
          walkSec = walkSecFromMeters(ndistM) * penalty;
        }

        const arr = cur.arrivalUnix + walkSec;
        const existing = bestArrival.get(nid);
        if (existing !== undefined && arr >= existing) continue;
        next.set(nid, {
          kind: "walk",
          arrivalUnix: arr,
          prevStopId: sid,
          prevArrivalUnix: cur.arrivalUnix,
          meters: verified ? verified.distanceM : ndistM,
        });
        bestArrival.set(nid, arr);
        diag.walkTransfers++;
      }
    }

    labels.push(next);
    diag.roundsRun = k;
    if (next.size === 0) break;
  }

  // 4) Reconstruct itineraries that reach a destination stop.
  // For each round and each destination stop reached, walk back through
  // labels to build the leg sequence.
  const itineraries: Itinerary[] = buildDirectRaptorItineraries({
    schedule,
    origins,
    directDests,
    from,
    to,
    departureUnix,
    searchHorizonSec: SEARCH_HORIZON_SEC,
    maxJourneySec: MAX_JOURNEY_SEC,
    planContext,
  });
  for (let k = 1; k < labels.length; k++) {
    for (const [destStopId, destMeta] of destSet) {
      const label = labels[k].get(destStopId);
      if (!label || label.kind !== "ride") continue;
      // Reconstruct
      const it = reconstruct(
        labels,
        k,
        destStopId,
        destMeta,
        schedule,
        from,
        to,
        departureUnix,
        planContext,
      );
      if (it) itineraries.push(it);
    }
  }
  diag.candidateItineraries = itineraries.length;

  return { itineraries: selectRaptorItineraries(itineraries, TOP_K_RESULTS), diagnostics: diag };
}

// ---- helpers --------------------------------------------------------------

function unixToServiceSec(date: string, unix: number): number {
  const midnight = serviceDateToUnix(date, 0);
  return unix - midnight;
}
