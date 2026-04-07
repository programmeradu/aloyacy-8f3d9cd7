// Wave 2.4 — "Why this route?" explanations.
//
// Pure, client-safe. Given a ranked list of itineraries (best first), assign
// up to 2 contrastive tags per itinerary by comparing each one against its
// peers. The goal is education + trust, not marketing: every tag must
// reflect a real numeric difference that the rider could verify themselves.
//
// Design rules:
// - Tags are contrastive. We never tag something on a single-result set
//   (nothing to contrast against).
// - The #1 option is allowed a "best-overall" fallback if it has no other
//   distinction worth mentioning — riders deserve to know why we sorted it
//   first even when the win is composite.
// - Thresholds are intentionally conservative so we don't over-promise:
//   ≥3 min for time deltas, ≥150 m for walking, ≥2 min for departure.
// - Each itinerary gets at most 2 tags so the UI stays one line on mobile.

import type { Itinerary, RationaleTag, RideLeg } from "./itinerary-types";

const FASTEST_MIN_DELTA_SEC = 180;       // 3 min
const SOONER_MIN_DELTA_SEC = 120;        // 2 min
const LESS_WALKING_MIN_DELTA_M = 150;
const RELIABLE_MIN_DELAY_DELTA_SEC = 120; // peer must be ≥2 min more delayed

function ridesOf(it: Itinerary): RideLeg[] {
  return it.legs.filter((l): l is RideLeg => l.kind === "ride");
}

function totalAbsDelay(it: Itinerary): number {
  return ridesOf(it).reduce((acc, r) => acc + Math.abs(r.delaySec || 0), 0);
}

function isFullyLive(it: Itinerary): boolean {
  const rides = ridesOf(it);
  return rides.length > 0 && rides.every((r) => r.live);
}

/**
 * Mutates `itineraries` in place, attaching `rationale` tags to each.
 * Returns the same array for convenience.
 *
 * Caller is expected to have already sorted by score (best first).
 */
export function annotateRationales(itineraries: Itinerary[]): Itinerary[] {
  if (itineraries.length === 0) return itineraries;
  if (itineraries.length === 1) {
    // Single result — nothing to contrast. Leave rationale undefined.
    return itineraries;
  }

  // Pre-compute peer extremes for cheap lookup.
  const arrivalTimes = itineraries.map((it) => it.arrivalUnix);
  const minArrival = Math.min(...arrivalTimes);
  // "Best peer arrival" excluding self is what we compare against.

  const transferCounts = itineraries.map((it) => it.transfers);
  const minTransfers = Math.min(...transferCounts);
  const maxTransfers = Math.max(...transferCounts);

  const walkMeters = itineraries.map((it) => it.totalWalkMeters);
  const minWalk = Math.min(...walkMeters);

  const departures = itineraries.map((it) => it.departureUnix);
  const minDeparture = Math.min(...departures);

  const delays = itineraries.map(totalAbsDelay);
  const minDelay = Math.min(...delays);

  const anyMixed = itineraries.some((it) => !isFullyLive(it));

  for (let i = 0; i < itineraries.length; i++) {
    const it = itineraries[i];
    const tags: RationaleTag[] = [];

    // 1. Fastest arrival — beats every other peer by ≥3 min.
    if (it.arrivalUnix === minArrival) {
      const peerBest = itineraries
        .filter((_, j) => j !== i)
        .reduce((acc, p) => Math.min(acc, p.arrivalUnix), Number.POSITIVE_INFINITY);
      const deltaSec = peerBest - it.arrivalUnix;
      if (deltaSec >= FASTEST_MIN_DELTA_SEC) {
        tags.push({ kind: "fastest", minutesEarlier: Math.round(deltaSec / 60) });
      }
    }

    // 2. No-changes / fewer-changes — only when peers actually have more.
    if (it.transfers === minTransfers && maxTransfers > minTransfers) {
      if (it.transfers === 0) {
        tags.push({ kind: "no-changes" });
      } else {
        tags.push({ kind: "fewer-changes", n: it.transfers });
      }
    }

    // 3. Less walking — meaningfully under the peer minimum.
    if (it.totalWalkMeters === minWalk) {
      const peerBest = itineraries
        .filter((_, j) => j !== i)
        .reduce((acc, p) => Math.min(acc, p.totalWalkMeters), Number.POSITIVE_INFINITY);
      const saved = peerBest - it.totalWalkMeters;
      if (saved >= LESS_WALKING_MIN_DELTA_M) {
        tags.push({ kind: "less-walking", metersSaved: Math.round(saved) });
      }
    }

    // 4. All-live — only meaningful when at least one peer is mixed/estimated.
    if (isFullyLive(it) && anyMixed) {
      tags.push({ kind: "all-live" });
    }

    // 5. More reliable — lower observed delay than the best peer by a margin.
    if (delays[i] === minDelay) {
      const peerBest = delays
        .filter((_, j) => j !== i)
        .reduce((acc, d) => Math.min(acc, d), Number.POSITIVE_INFINITY);
      if (peerBest - delays[i] >= RELIABLE_MIN_DELAY_DELTA_SEC) {
        tags.push({ kind: "more-reliable" });
      }
    }

    // 6. Leaves sooner — earliest departure by ≥2 min.
    if (it.departureUnix === minDeparture) {
      const peerBest = itineraries
        .filter((_, j) => j !== i)
        .reduce((acc, p) => Math.min(acc, p.departureUnix), Number.POSITIVE_INFINITY);
      const sooner = peerBest - it.departureUnix;
      if (sooner >= SOONER_MIN_DELTA_SEC) {
        tags.push({ kind: "leaves-sooner", minutesSooner: Math.round(sooner / 60) });
      }
    }

    // Prefer the most informative two. Priority order is the order tags
    // were pushed above (fastest first, departure last).
    let picked = tags.slice(0, 2);

    // Fallback for the top option only: it was ranked #1 but no single
    // dimension dominates. Show the composite reason rather than nothing.
    if (i === 0 && picked.length === 0) {
      picked = [{ kind: "best-overall" }];
    }

    it.rationale = picked.length > 0 ? picked : undefined;
  }

  return itineraries;
}
