// Post-RAPTOR walk refinement.
//
// RAPTOR runs over the timetable using a fast haversine × 1.35 walking
// estimate so the search stays cheap. Once it returns the top-K
// itineraries, we replace every walk leg with a Google-verified
// duration / distance / polyline:
//
//   - Stop ↔ stop walks (transfer legs) go through `getWalkLink` so they
//     hit the persistent `walk_links` cache and never re-query Google
//     for a known pair.
//   - Access / egress walks (arbitrary place ↔ stop) call `walkingRoute`
//     directly. We do not cache by lat/lng for now — the surface area is
//     small (≤ 2 per itinerary × ≤ 5 itineraries) and arbitrary-coord
//     caching deserves its own design.
//
// After refinement we re-cascade times along the leg chain:
//   - Walks advance the rider's "ready" cursor by their new duration.
//   - Wait legs collapse / stretch to fill the gap before the next ride.
//   - If a verified walk now ends after its next ride's scheduled board
//     departure, the itinerary is infeasible and we drop it.
//
// All walk refinements within one itinerary run in parallel; all
// itineraries refine in parallel too. Worst-case: 5 itineraries × 4
// walks = 20 concurrent fetches, most of which hit the cache after the
// first run for a given OD pair.

import type { Itinerary, Leg, RideLeg, WaitLeg, WalkLeg } from "./itinerary-types";
import { getWalkLink } from "./walk-links.server";
import { walkingRoute } from "./maps.server";

async function refineWalk(walk: WalkLeg): Promise<WalkLeg> {
  try {
    if (walk.from.stopId && walk.to.stopId) {
      const link = await getWalkLink(walk.from.stopId, walk.to.stopId);
      if (link.verified) {
        return {
          ...walk,
          durationSec: link.durationSec,
          distanceMeters: link.distanceM,
          polyline: link.polyline,
          verified: true,
        };
      }
      return walk;
    }
    const route = await walkingRoute(
      { lat: walk.from.lat, lng: walk.from.lng },
      { lat: walk.to.lat, lng: walk.to.lng },
    );
    if (!route) return walk;
    return {
      ...walk,
      durationSec: route.durationSec,
      distanceMeters: route.distanceMeters,
      polyline: route.polyline,
      verified: true,
    };
  } catch (e) {
    console.warn("[walk-refine] failed:", (e as Error).message);
    return walk;
  }
}

export async function refineItineraryWalks(it: Itinerary): Promise<Itinerary | null> {
  const refined: Leg[] = await Promise.all(
    it.legs.map((leg) => (leg.kind === "walk" ? refineWalk(leg) : Promise.resolve(leg))),
  );

  // Single pass: validate feasibility, rewrite waits, accumulate totals.
  let cursor = it.departureUnix;
  let totalWalk = 0;
  const out: Leg[] = [];
  for (let i = 0; i < refined.length; i++) {
    const leg = refined[i];
    if (leg.kind === "walk") {
      cursor += leg.durationSec;
      totalWalk += leg.distanceMeters;
      out.push(leg);
    } else if (leg.kind === "ride") {
      if (cursor > leg.board.departureUnix) return null; // missed the bus
      cursor = leg.alight.arrivalUnix;
      out.push(leg);
    } else if (leg.kind === "wait") {
      // Collapse the wait to whatever gap remains before the next ride.
      let nextBoard: number | null = null;
      for (let j = i + 1; j < refined.length; j++) {
        const next = refined[j];
        if (next.kind === "ride") {
          nextBoard = next.board.departureUnix;
          break;
        }
      }
      const newWait =
        nextBoard !== null ? Math.max(0, nextBoard - cursor) : (leg as WaitLeg).durationSec;
      out.push({ ...leg, durationSec: newWait });
      cursor += newWait;
    }
  }

  const arrivalUnix = cursor;
  const totalDurationSec = arrivalUnix - it.departureUnix;
  const rides = out.filter((l): l is RideLeg => l.kind === "ride");
  const transfers = Math.max(0, rides.length - 1);
  const transferPenaltySec = transfers * 120;
  const walkPenaltySec = Math.max(0, totalWalk - 500) * 0.4;
  const score = totalDurationSec + transferPenaltySec + walkPenaltySec;

  return {
    ...it,
    legs: out,
    totalDurationSec,
    arrivalUnix,
    totalWalkMeters: totalWalk,
    score,
  };
}

export async function refineAllItineraries(its: Itinerary[]): Promise<Itinerary[]> {
  const refined = await Promise.all(its.map((it) => refineItineraryWalks(it)));
  return refined
    .filter((it): it is Itinerary => it !== null)
    .sort((a, b) => a.score - b.score);
}
