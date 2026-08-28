// Dest-aware wait-or-bail for the journey HUD.
// Same-stop skip / other-route / last-tonight stay in wait-or-bail.ts.
// This module needs a destination: walk vs wait, from a measured walk.
// RAPTOR re-plan already lives in the live-replan sheet. Taxi fares stay
// unpublished here — we have a dest, but not a driving quote on this path.

import { distanceM, WALK_M_PER_S, type LatLng } from "./geo";

/** Street path vs crow-flies. Same factor the replan sheet used. */
export const WALK_DETOUR = 1.3;
/** Do not propose a walk longer than this. */
export const WALK_MAX_MIN = 25;
/** Walk must beat the wait by this much, or we keep waiting. */
export const WALK_BEATS_WAIT_MIN = 2;

export function estimateWalk(from: LatLng, to: LatLng): { min: number; meters: number } | null {
  if (
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return null;
  }
  const meters = Math.round(distanceM(from, to) * WALK_DETOUR);
  const min = Math.max(1, Math.round(meters / WALK_M_PER_S / 60));
  if (min > WALK_MAX_MIN) return null;
  return { min, meters };
}

export function estimateWalkMin(from: LatLng, to: LatLng): number | null {
  return estimateWalk(from, to)?.min ?? null;
}

export type DestBail =
  | {
      kind: "walk";
      walkMin: number;
      waitMin: number;
      destLabel: string;
      routeShort: string;
    }
  | { kind: "keepWait"; walkMin: number; waitMin: number; routeShort: string };

export function pickDestBail(input: {
  dark: boolean;
  waitMin: number;
  walkMin: number | null;
  destLabel: string;
  routeShort: string;
}): DestBail | null {
  if (!input.dark) return null;
  const routeShort = input.routeShort.trim();
  if (!routeShort) return null;
  if (input.walkMin == null || !Number.isFinite(input.walkMin) || input.walkMin < 1) {
    return null;
  }
  if (!Number.isFinite(input.waitMin) || input.waitMin < 0) return null;
  const waitMin = Math.round(input.waitMin);
  const walkMin = Math.round(input.walkMin);
  const destLabel = input.destLabel.trim();

  if (walkMin + WALK_BEATS_WAIT_MIN <= waitMin && destLabel) {
    return { kind: "walk", walkMin, waitMin, destLabel, routeShort };
  }
  return { kind: "keepWait", walkMin, waitMin, routeShort };
}

/** Walking to the stop: only speak if walking to dest is the better move. */
export function destBailForWait(input: {
  dark: boolean;
  phase: "walking" | "waiting" | "other";
  waitMin: number;
  from: LatLng | null;
  to: LatLng | null;
  destLabel: string;
  routeShort: string;
}): DestBail | null {
  if (input.phase === "other") return null;
  const walkMin = input.from && input.to ? estimateWalkMin(input.from, input.to) : null;
  const action = pickDestBail({
    dark: input.dark,
    waitMin: input.waitMin,
    walkMin,
    destLabel: input.destLabel,
    routeShort: input.routeShort,
  });
  if (!action) return null;
  if (input.phase === "walking" && action.kind !== "walk") return null;
  return action;
}

export function destBailLine(action: DestBail): string {
  switch (action.kind) {
    case "walk":
      return `Walk to ${action.destLabel} in ${action.walkMin} min. Bus ${action.routeShort} isn't on the map.`;
    case "keepWait":
      if (action.waitMin <= 0) {
        return `Walking is ${action.walkMin} min. Bus ${action.routeShort} isn't on the map.`;
      }
      return `Walking is ${action.walkMin} min. Bus ${action.routeShort} is about ${action.waitMin} min if it shows.`;
  }
}
