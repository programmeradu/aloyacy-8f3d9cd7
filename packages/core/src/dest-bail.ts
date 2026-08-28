// Dest-aware wait-or-bail for the journey HUD, plus one push if the
// call flips while the rider is still standing there.
// Same-stop skip / other-route / last-tonight stay in wait-or-bail.ts.
// RAPTOR re-plan already lives in the live-replan sheet. Taxi fares stay
// unpublished here — we have a dest, but not a driving quote on this path.

import { distanceM, WALK_M_PER_S, type LatLng } from "./geo";

/** Street path vs crow-flies. Same factor the replan sheet used. */
export const WALK_DETOUR = 1.3;
/** Do not propose a walk longer than this. */
export const WALK_MAX_MIN = 25;
/** Walk must beat the wait by this much, or we keep waiting. */
export const WALK_BEATS_WAIT_MIN = 2;
/** Previous walk-or-wait kind must hold this long before a flip is a push. */
export const WAIT_FLIP_HOLD_SEC = 60;

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

/** Map a live/multi-leg/hero phase onto dest-bail's three states. */
export function waitFlipPhase(phase: string): "walking" | "waiting" | "other" {
  switch (phase) {
    case "walking":
    case "walking-to-stop":
    case "walking-to-board":
      return "walking";
    case "waiting":
    case "at-stop":
    case "waiting-to-board":
    case "hurry-soft":
    case "hurry-urgent":
    case "boarding":
      return "waiting";
    default:
      return "other";
  }
}

export type DestBailFlip = { from: DestBail; to: DestBail };

export type WaitFlipHold = {
  prev: DestBail | null;
  sinceUnix: number | null;
  spoken: boolean;
};

export const EMPTY_WAIT_FLIP_HOLD: WaitFlipHold = {
  prev: null,
  sinceUnix: null,
  spoken: false,
};

/**
 * Whether the walk-or-wait call just flipped in a way worth a push.
 * Null if already spoken this wait, missing either side, same kind, or the
 * previous kind has not been held for WAIT_FLIP_HOLD_SEC.
 */
export function nextWaitFlip(input: {
  prev: DestBail | null;
  next: DestBail | null;
  flipSpoken: boolean;
  prevSinceUnix: number | null;
  nowUnix: number;
}): DestBailFlip | null {
  if (input.flipSpoken) return null;
  if (!input.prev || !input.next) return null;
  if (input.prev.kind === input.next.kind) return null;
  if (input.prevSinceUnix == null) return null;
  if (input.nowUnix - input.prevSinceUnix < WAIT_FLIP_HOLD_SEC) return null;
  return { from: input.prev, to: input.next };
}

/** Advance hold state. Reset the session when the action goes silent. */
export function tickWaitFlip(
  hold: WaitFlipHold,
  next: DestBail | null,
  nowUnix: number,
): { hold: WaitFlipHold; flip: DestBailFlip | null } {
  if (!next) return { hold: EMPTY_WAIT_FLIP_HOLD, flip: null };
  const flip = nextWaitFlip({
    prev: hold.prev,
    next,
    flipSpoken: hold.spoken,
    prevSinceUnix: hold.sinceUnix,
    nowUnix,
  });
  if (flip) {
    return { hold: { prev: next, sinceUnix: nowUnix, spoken: true }, flip };
  }
  if (!hold.prev || hold.prev.kind !== next.kind) {
    return { hold: { prev: next, sinceUnix: nowUnix, spoken: hold.spoken }, flip: null };
  }
  return { hold: { ...hold, prev: next }, flip: null };
}

export function destBailFlipLine(flip: DestBailFlip): string {
  const a = flip.to;
  if (a.kind === "walk") {
    if (a.waitMin <= 0) {
      return `Bus ${a.routeShort} isn't on the map. Walking is ${a.walkMin} min — walk.`;
    }
    return `Bus ${a.routeShort} is now ${a.waitMin} min if it shows. Walking is ${a.walkMin} min — walk.`;
  }
  if (a.waitMin <= 0) {
    return `Bus ${a.routeShort} isn't on the map. Walking is ${a.walkMin} min — wait.`;
  }
  return `Bus ${a.routeShort} is about ${a.waitMin} min if it shows. Walking is ${a.walkMin} min — wait.`;
}

export function destBailFlipCopy(flip: DestBailFlip): { title: string; body: string } {
  const { to } = flip;
  const title =
    to.kind === "walk" ? `Walk to ${to.destLabel}` : `Keep waiting for Bus ${to.routeShort}`;
  return { title, body: destBailFlipLine(flip) };
}

/** Rebuild the new dest-bail from a wait-flip alert's semantic fields. */
export function destBailForFlipAlert(input: {
  flipTo?: "walk" | "keepWait" | null;
  walkMin?: number | null;
  waitMin?: number | null;
  routeShort?: string | null;
  destLabel?: string | null;
}): DestBail | null {
  if (input.flipTo !== "walk" && input.flipTo !== "keepWait") return null;
  if (input.walkMin == null || input.waitMin == null) return null;
  if (!Number.isFinite(input.walkMin) || !Number.isFinite(input.waitMin)) return null;
  const routeShort = (input.routeShort ?? "").trim();
  if (!routeShort) return null;
  if (input.flipTo === "walk") {
    const destLabel = (input.destLabel ?? "").trim();
    if (!destLabel) return null;
    return {
      kind: "walk",
      walkMin: Math.round(input.walkMin),
      waitMin: Math.round(input.waitMin),
      destLabel,
      routeShort,
    };
  }
  return {
    kind: "keepWait",
    walkMin: Math.round(input.walkMin),
    waitMin: Math.round(input.waitMin),
    routeShort,
  };
}
