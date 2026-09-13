// Multi-leg journey search — server wiring.
//
// The Cyprus GTFS bundle ships only route topology (no stop_times), so the
// search is driven by the realtime feed, which carries trip-level stop times
// for the next ~60–90 min. All of the actual search — feasibility, scoring,
// dedupe, pruning — lives in the pure `@aloya/core/multileg-search` module so
// it can be tested without a network. This file only:
//   1. fetches the live arrivals and the static topology,
//   2. runs the pure search,
//   3. lazily upgrades walking geometry for the top few results.

import { fetchRealtime } from "./gtfs-rt.server";
import { STOPS, ROUTES } from "./gtfs";
import { getTransferCandidates } from "./transfer-graph.server";
import { getWalkLink } from "./walk-links.server";
import type { Itinerary } from "./itinerary-types";
import {
  MAX_ACCESS_WALK_KM,
  distanceKm,
  pruneDominated,
  recomputeTotals,
  searchMultiLeg,
  type MlArrival,
  type MultiLegDiagnostics,
  type PlanContext,
} from "@aloya/core/multileg-search";
import { createLogger } from "@/lib/logger";
import { sameStation, stationIdOf } from "./stations.server";
import { buildHeadwayIndex } from "@aloya/core/headway";
import { skipMapKey } from "@aloya/core/skip-rate";
import { loadSkipFractionMap } from "./skip-rate.server";
import { withTimeout } from "@/lib/server-cache";

const log = createLogger("multileg");

export type { MultiLegDiagnostics };

const VERIFY_WALKS_FOR_TOP = 3; // upgrade walking geometry only for top 3

const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, { short: r.short, long: r.long }]));
const STOP_BY_ID = new Map(STOPS.map((s) => [s.id, s]));

/** Real walking geometry for the top picks, then re-score with the truth. */
async function verifyWalks(top: Itinerary[], now: number, ctx?: PlanContext): Promise<void> {
  await Promise.all(
    top.slice(0, VERIFY_WALKS_FOR_TOP).map(async (it) => {
      for (const leg of it.legs) {
        if (leg.kind !== "walk") continue;
        if (!leg.from.stopId || !leg.to.stopId) continue;
        const real = await getWalkLink(leg.from.stopId, leg.to.stopId);
        if (real.verified && real.distanceM < 99_000) {
          leg.durationSec = real.durationSec;
          leg.distanceMeters = real.distanceM;
          leg.verified = true;
          leg.polyline = real.polyline;
        }
      }
      recomputeTotals(it, now, ctx);
    }),
  );
}

function nearbyArrivalStopIds(arrivals: MlArrival[], from: { lat: number; lng: number }): string[] {
  const ids = new Set<string>();
  for (const a of arrivals) {
    const s = STOP_BY_ID.get(a.stopId);
    if (!s) continue;
    if (distanceKm(from, s) > MAX_ACCESS_WALK_KM) continue;
    ids.add(a.stopId);
    if (ids.size >= 80) break;
  }
  return [...ids];
}

export async function planMultiLegJourney(
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  opts?: { collectDiagnostics?: boolean },
): Promise<{ itineraries: Itinerary[]; diagnostics?: MultiLegDiagnostics }> {
  const t0 = Date.now();
  const now = Math.floor(Date.now() / 1000);

  const rt = await fetchRealtime();
  const arrivals: MlArrival[] = rt.arrivals.map((a) => ({
    tripId: a.tripId,
    routeId: a.routeId,
    stopId: a.stopId,
    arrivalUnix: a.arrivalUnix,
    delaySec: a.delaySec,
  }));

  // How often each route really runs, measured from the departures the feed
  // is showing right now. This is what makes a change onto a frequent route
  // cheap and a change onto a rare one expensive.
  const headways = buildHeadwayIndex(
    arrivals.map((a) => ({ routeId: a.routeId, stopId: a.stopId, timeUnix: a.arrivalUnix })),
  );
  // Skip rates only sharpen ranking; a slow database must not stall the plan.
  const skipMap = await withTimeout(
    loadSkipFractionMap(nearbyArrivalStopIds(arrivals, from)).catch(
      () => new Map<string, number>(),
    ),
    1_200,
    new Map<string, number>(),
  );
  const ctx: PlanContext = {
    sameStation,
    headwayOf: (routeId) => headways.get(routeId) ?? null,
    skipOf: (stopId, routeId) => skipMap.get(skipMapKey(stopId, routeId)) ?? null,
  };

  const { itineraries, diagnostics } = searchMultiLeg({
    from,
    to,
    stops: STOPS,
    routeById: ROUTE_BY_ID,
    arrivals,
    transferIndex: getTransferCandidates(),
    now,
    sameStation,
    stationIdOf,
    headwayOf: ctx.headwayOf,
    skipOf: ctx.skipOf,
  });

  await verifyWalks(itineraries, now, ctx);
  // Real walking geometry can change which options are genuinely better, so
  // dominance is re-checked against the verified totals rather than the
  // straight-line estimates the search ran on.
  const preferred = pruneDominated(itineraries);
  preferred.sort((a: Itinerary, b: Itinerary) => a.score - b.score);

  const elapsed = Date.now() - t0;
  if (elapsed > 1500) {
    log.warn("search over budget", { elapsedMs: elapsed });
  }
  return {
    itineraries: preferred,
    diagnostics: opts?.collectDiagnostics ? diagnostics : undefined,
  };
}
