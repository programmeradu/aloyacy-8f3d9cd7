// Assembling, scoring and ranking multi-leg itineraries.
//
// Split out of `multileg-legs.ts` so leg construction and result ranking can
// be read (and tested) apart from each other. The cost model itself lives in
// `plan-score.ts`; this module supplies it with facts read off the legs —
// which walks are street walks, which are bay hops inside one station, and
// what each change actually involves.

import type { Itinerary, Leg, RideLeg, WalkLeg } from "./itinerary-types";
import { filterDominated, scoreItinerary, skipRiskSec, UNKNOWN_HEADWAY_SEC, type ChangeCost } from "./plan-score";
import { MAX_TOTAL_JOURNEY_SEC, TOP_K_RESULTS, type MultiLegDiagnostics } from "./multileg-legs";

/**
 * Facts the scorer needs that only the caller can supply: which stops belong
 * to the same station, and how often each route actually runs.
 */
export type PlanContext = {
  sameStation?: (aStopId: string, bStopId: string) => boolean;
  headwayOf?: (routeId: string) => number | null;
  /** Spoken skip fraction (0–1) at a board stop. Null when we stay silent. */
  skipOf?: (stopId: string, routeId: string) => number | null;
};

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
  let skip = 0;
  if (ctx?.skipOf) {
    for (const r of rides) {
      const f = ctx.skipOf(r.board.stopId, r.routeId);
      if (f == null) continue;
      skip += skipRiskSec(f, ctx.headwayOf?.(r.routeId) ?? UNKNOWN_HEADWAY_SEC);
    }
  }
  return scoreItinerary({
    totalDurationSec,
    walkMeters: streetMeters,
    inStationHopMeters: inStationMeters,
    changes: describeChanges(legs, ctx),
    reliabilitySec: rides.reduce((acc, r) => acc + Math.max(0, r.delaySec), 0),
    skipRiskSec: skip,
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
  kept = pruneDominated(kept);
  diag.prunedMediocre = beforePrune - kept.length;


  kept.sort((a, b) => a.score - b.score);
  const top = kept.slice(0, TOP_K_RESULTS);
  diag.keptCount = top.length;
  return top;
}

