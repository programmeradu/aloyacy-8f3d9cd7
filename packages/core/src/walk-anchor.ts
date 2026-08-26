// Where the final walk actually starts.
//
// The plan says "walk from Kykkou Street to your door". Riders routinely get
// off somewhere else — a stop early because the bell went late, a stop later
// because they missed it, or across the road at a different bay. Drawing the
// walking line from the planned stop then sends them back to a kerb they are
// no longer standing on.
//
// So once the ride is over, the walk is anchored to the rider's own position.
// The only subtlety is churn: a raw GPS anchor would re-request directions on
// every jitter of the fix. Hence hysteresis — the anchor only moves when the
// rider has genuinely walked away from it.

import { distanceM } from "./geo";
import type { LatLng } from "./shapes";

export const WALK_ANCHOR = {
  /** Rider must move this far from the current anchor before it follows. */
  HYSTERESIS_M: 60,
  /** Within this of the planned stop, keep the planned point (nicer label). */
  SNAP_TO_PLANNED_M: 40,
  /** Fixes vaguer than this are not trusted to move the anchor. */
  MAX_ACCURACY_M: 80,
} as const;

export type WalkAnchor = LatLng & {
  /** True when the anchor is the rider's live position rather than the plan. */
  live: boolean;
};

/**
 * Resolve the origin of a walking leg.
 *
 * @param planned  The stop/point the plan walks from.
 * @param fix      The rider's current position, if any.
 * @param previous The anchor returned last tick, for hysteresis.
 * @param useLive  False while the rider is still on the bus — then the planned
 *                 point is correct and their moving position is not.
 */
export function resolveWalkAnchor(input: {
  planned: LatLng | null;
  fix: (LatLng & { accuracyM?: number | null }) | null;
  previous: WalkAnchor | null;
  useLive: boolean;
}): WalkAnchor | null {
  const { planned, fix, previous, useLive } = input;
  const W = WALK_ANCHOR;

  if (!useLive || !fix) {
    return planned ? { ...planned, live: false } : null;
  }

  const accuracy = fix.accuracyM ?? 0;
  if (accuracy > W.MAX_ACCURACY_M) {
    // Too vague to move anything: keep whatever we had.
    return previous ?? (planned ? { ...planned, live: false } : null);
  }

  // Standing essentially at the planned stop — the plan's own point reads
  // better on the map and keeps the directions cache warm.
  if (planned && distanceM(fix, planned) < W.SNAP_TO_PLANNED_M) {
    return { ...planned, live: false };
  }

  if (previous && previous.live && distanceM(fix, previous) < W.HYSTERESIS_M) {
    return previous;
  }

  return { lat: fix.lat, lng: fix.lng, live: true };
}
