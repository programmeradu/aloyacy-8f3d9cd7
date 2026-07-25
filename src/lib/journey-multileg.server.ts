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
  recomputeTotals,
  searchMultiLeg,
  type MlArrival,
  type MultiLegDiagnostics,
} from "@aloya/core/multileg-search";

export type { MultiLegDiagnostics };

const VERIFY_WALKS_FOR_TOP = 3; // upgrade walking geometry only for top 3

const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, { short: r.short, long: r.long }]));

/** Real walking geometry for the top picks, then re-score with the truth. */
async function verifyWalks(top: Itinerary[], now: number): Promise<void> {
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
      recomputeTotals(it, now);
    }),
  );
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

  const { itineraries, diagnostics } = searchMultiLeg({
    from,
    to,
    stops: STOPS,
    routeById: ROUTE_BY_ID,
    arrivals,
    transferIndex: getTransferCandidates(),
    now,
  });

  await verifyWalks(itineraries, now);
  // Verified walks may have shifted scores.
  itineraries.sort((a, b) => a.score - b.score);

  const elapsed = Date.now() - t0;
  if (elapsed > 1500) {
    console.warn(`[multileg] search took ${elapsed}ms — over budget`);
  }
  return { itineraries, diagnostics: opts?.collectDiagnostics ? diagnostics : undefined };
}
