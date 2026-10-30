// Stop-aware alighting countdown.
//
// The old cascade decided "press the stop button" from an ETA
// (`secsToAlight <= 60`) or from a raw crow-flies radius. Both fire far too
// early on a busy urban route: a bus can sit 400 m from the alight stop with
// four stops still to serve, and the feed's ETA is routinely optimistic by
// minutes. Riders were being told to ring the bell five stops out.
//
// This module counts *stops*, not seconds. Given the trip's ordered stop
// sequence and the current bus position it answers the only three questions
// a rider on board actually has:
//
//   - which stop are we at (or heading into) right now?
//   - how many stops until mine?
//   - is it time to press the button?
//
// The cue ladder mirrors what a local would do:
//   3 stops out  → "get ready"   (soft buzz, start watching)
//   1 stop out   → "stand by"    (yours is next after this one)
//   0 stops out  → "press now"   (the bus has left the stop before yours)
//   at the stop  → "alighting"
//
// Everything is pure so it can be pinned by tests and shared by web + native.

import { distanceM, type LatLng } from "./geo";

export type AlightStage =
  /** More than `GET_READY_STOPS` stops away — stay seated, no cues. */
  | "cruising"
  /** Within the get-ready window: 2–3 stops out. */
  | "get-ready"
  /** Exactly one stop before yours. Yours is next. */
  | "stand-by"
  /** The bus has left the stop before yours — ring the bell now. */
  | "press-now"
  /** The bus is standing at your stop. */
  | "alighting"
  /** Your stop is behind us. */
  | "passed";

export type CountdownStop = {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  /** Position in the trip's stop sequence. */
  index: number;
  /** Stops still to be served before this one (0 = it is next). */
  stopsAway: number;
};

export type StopLookup = (
  stopId: string,
) => { name?: string | null; lat: number; lng: number } | null | undefined;

export type AlightCountdownInput = {
  /** Ordered stop ids for this trip, or null when we have no sequence. */
  sequence: string[] | null;
  alightStopId: string;
  /** Stop the rider boarded at — disambiguates loop routes. */
  boardStopId?: string | null;
  getStop: StopLookup;
  /** Best current bus position: fused vehicle while riding, else the feed. */
  position: LatLng | null;
  /** Bus speed in m/s when known; used to tell dwelling from passing. */
  speedMps?: number | null;
  /** Fallback alight coordinates when the sequence is unavailable. */
  alightLoc?: LatLng | null;
};

export type AlightCountdown = {
  stage: AlightStage;
  /** Stops still to be served before the alight stop. 0 = yours is next. */
  stopsRemaining: number | null;
  /** Crow-flies metres from the bus to the alight stop, when known. */
  metersToAlight: number | null;
  /** The bus is standing at a stop right now. */
  atStop: boolean;
  /** Stop the bus is at, or the one it most recently served. */
  currentStop: CountdownStop | null;
  /** Next stop the bus will serve. */
  nextStop: CountdownStop | null;
  /** Every stop from `nextStop` through the alight stop, in order. */
  upcoming: CountdownStop[];
  alightStop: CountdownStop | null;
  /** False when we fell back to distance-only reasoning. */
  hasSequence: boolean;
};

export const ALIGHT_TUNING = {
  /** Within this radius of a stop centre the bus counts as serving it. */
  AT_STOP_RADIUS_M: 55,
  /** Above this speed the bus is running, not dwelling. */
  DWELL_SPEED_MPS: 2.5,
  /** First cue fires this many stops out. */
  GET_READY_STOPS: 3,
  // ---- Distance-only fallback thresholds (no sequence available) ----------
  FALLBACK_READY_M: 900,
  FALLBACK_STANDBY_M: 350,
  FALLBACK_PRESS_M: 150,
  FALLBACK_AT_STOP_M: 45,
} as const;

const T = ALIGHT_TUNING;

const IDLE: AlightCountdown = {
  stage: "cruising",
  stopsRemaining: null,
  metersToAlight: null,
  atStop: false,
  currentStop: null,
  nextStop: null,
  upcoming: [],
  alightStop: null,
  hasSequence: false,
};

/**
 * Picks the stop sequence that actually carries this ride: the one where the
 * alight stop sits after the board stop. Loop routes list the same stop twice
 * under different direction keys, so guessing by route alone is not enough.
 */
export function sequenceForTrip(
  sequences: Record<string, string[]>,
  routeId: string,
  boardStopId: string,
  alightStopId: string,
): string[] | null {
  const prefix = routeId + "|";
  let fallback: string[] | null = null;
  for (const key of Object.keys(sequences)) {
    if (!key.startsWith(prefix)) continue;
    const seq = sequences[key];
    const b = seq.indexOf(boardStopId);
    const a = seq.indexOf(alightStopId);
    if (b >= 0 && a > b) return seq;
    if (a >= 0 && !fallback) fallback = seq;
  }
  return fallback;
}

function toStop(
  seq: string[],
  index: number,
  getStop: StopLookup,
  nextIdx: number,
): CountdownStop | null {
  const id = seq[index];
  if (!id) return null;
  const s = getStop(id);
  if (!s) return null;
  return {
    stopId: id,
    name: s.name?.trim() || id,
    lat: s.lat,
    lng: s.lng,
    index,
    stopsAway: index - nextIdx,
  };
}

/** Distance-only ladder, used when the trip has no usable stop sequence. */
function fallbackCountdown(
  position: LatLng | null,
  alightLoc: LatLng | null | undefined,
  speedMps: number | null | undefined,
): AlightCountdown {
  if (!position || !alightLoc) return IDLE;
  const d = distanceM(position, alightLoc);
  const slow = speedMps == null || speedMps < T.DWELL_SPEED_MPS;
  let stage: AlightStage;
  if (d <= T.FALLBACK_AT_STOP_M && slow) stage = "alighting";
  else if (d <= T.FALLBACK_PRESS_M) stage = "press-now";
  else if (d <= T.FALLBACK_STANDBY_M) stage = "stand-by";
  else if (d <= T.FALLBACK_READY_M) stage = "get-ready";
  else stage = "cruising";
  return {
    ...IDLE,
    stage,
    metersToAlight: d,
    atStop: stage === "alighting",
  };
}

/**
 * Where the bus is along the trip and how many stops are left before the
 * rider's own. Falls back to a distance ladder when no sequence is available,
 * and returns a calm "cruising" idle state when there is nothing to measure.
 */
export function computeAlightCountdown(input: AlightCountdownInput): AlightCountdown {
  const { sequence, alightStopId, boardStopId, getStop, position, speedMps, alightLoc } = input;
  if (!sequence || sequence.length < 2 || !position) {
    return fallbackCountdown(position, alightLoc, speedMps);
  }

  // Coordinates for every stop we can resolve. A feed gap on one stop must
  // not derail the whole countdown, so unknown stops are simply skipped when
  // searching for the nearest — they still occupy their index.
  const known: { index: number; loc: LatLng }[] = [];
  for (let i = 0; i < sequence.length; i++) {
    const s = getStop(sequence[i]);
    if (s) known.push({ index: i, loc: { lat: s.lat, lng: s.lng } });
  }
  if (known.length < 2) return fallbackCountdown(position, alightLoc, speedMps);

  // Nearest served stop to the current position.
  let nearestIdx = known[0].index;
  let nearestDist = distanceM(position, known[0].loc);
  for (const k of known) {
    const d = distanceM(position, k.loc);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = k.index;
    }
  }

  // Alight index: prefer the occurrence ahead of the board stop (loops list a
  // stop twice), then the one at or after where the bus currently is.
  let alightIdx = -1;
  if (boardStopId) {
    const b = sequence.indexOf(boardStopId);
    if (b >= 0) alightIdx = sequence.indexOf(alightStopId, b + 1);
  }
  if (alightIdx < 0) {
    const ahead = sequence.indexOf(alightStopId, nearestIdx);
    alightIdx = ahead >= 0 ? ahead : sequence.indexOf(alightStopId);
  }
  if (alightIdx < 0) return fallbackCountdown(position, alightLoc, speedMps);

  const dwelling = nearestDist <= T.AT_STOP_RADIUS_M;
  const slow = speedMps == null || speedMps < T.DWELL_SPEED_MPS;
  const atStop = dwelling && slow;

  // Which stop is next? While dwelling, the current one still counts as being
  // served. Once clear of it, we are next-bound — unless we are physically
  // closer to the following stop than the two stops are to each other, which
  // means we have already rolled past it.
  let nextIdx = nearestIdx;
  if (!dwelling) {
    const following = known.find((k) => k.index > nearestIdx);
    const cur = known.find((k) => k.index === nearestIdx);
    if (following && cur) {
      const legLength = distanceM(cur.loc, following.loc);
      const toFollowing = distanceM(position, following.loc);
      if (toFollowing < legLength) nextIdx = following.index;
    }
  }

  const stopsRemaining = alightIdx - nextIdx;
  const alightStop = toStop(sequence, alightIdx, getStop, nextIdx);
  const metersToAlight = alightStop
    ? distanceM(position, { lat: alightStop.lat, lng: alightStop.lng })
    : alightLoc
      ? distanceM(position, alightLoc)
      : null;

  let stage: AlightStage;
  if (stopsRemaining < 0) stage = "passed";
  else if (stopsRemaining === 0 && atStop) stage = "alighting";
  else if (stopsRemaining === 0) stage = "press-now";
  else if (stopsRemaining === 1) stage = "stand-by";
  else if (stopsRemaining <= T.GET_READY_STOPS) stage = "get-ready";
  else stage = "cruising";

  const upcoming: CountdownStop[] = [];
  for (let i = nextIdx; i <= alightIdx; i++) {
    const s = toStop(sequence, i, getStop, nextIdx);
    if (s) upcoming.push(s);
  }

  return {
    stage,
    stopsRemaining,
    metersToAlight,
    atStop,
    currentStop: toStop(sequence, nearestIdx, getStop, nextIdx),
    nextStop: toStop(sequence, nextIdx, getStop, nextIdx),
    upcoming,
    alightStop,
    hasSequence: true,
  };
}

/** True once the rider should be told anything at all about alighting. */
export function isAlightCue(stage: AlightStage): boolean {
  return stage === "get-ready" || stage === "stand-by" || stage === "press-now";
}

/**
 * The stage transitions that deserve a buzz. Returned key is stable so the
 * caller can de-duplicate across renders.
 */
export function alightAlertFor(
  stage: AlightStage,
  alightName: string,
): { key: string; kind: "alight-ready" | "press-stop"; stopName: string } | null {
  if (stage === "get-ready") {
    return { key: "alight-ready", kind: "alight-ready", stopName: alightName };
  }
  if (stage === "press-now") {
    return { key: "press-stop", kind: "press-stop", stopName: alightName };
  }
  return null;
}

export type AlightCopy = { kicker: string; headline: string; body: string };

/** Rider-facing wording for the countdown card. */
export function alightCountdownCopy(cd: AlightCountdown, alightName: string): AlightCopy {
  const at = cd.currentStop?.name ?? null;
  const next = cd.nextStop?.name ?? null;
  const n = cd.stopsRemaining;

  switch (cd.stage) {
    case "alighting":
      return {
        kicker: "This is your stop",
        headline: `${alightName}, step off`,
        body: "Mind the step. We'll pick the walk up from wherever you land.",
      };
    case "press-now":
      return {
        kicker: "Press the stop button",
        headline: `${alightName} is next`,
        body: at
          ? `The bus has left ${at}. Ring the bell now so the driver stops for you.`
          : "Ring the bell now so the driver stops for you.",
      };
    case "stand-by":
      return {
        kicker: "One stop to go",
        headline: next ? `After ${next}, yours` : `${alightName} after this one`,
        body: next
          ? `Wait until the bus pulls away from ${next}, then press the button.`
          : "Wait for the bus to pull away from this stop, then press the button.",
      };
    case "get-ready":
      return {
        kicker: n != null ? `${n} stops to go` : "Getting close",
        headline: `Get ready for ${alightName}`,
        body: at
          ? `Now at ${at}. We'll tell you the exact moment to press the button.`
          : "We'll tell you the exact moment to press the button.",
      };
    case "passed":
      return {
        kicker: "Stop passed",
        headline: `${alightName} is behind us`,
        body: "Step off at the next stop and we'll re-plan the walk from there.",
      };
    default:
      return {
        kicker: n != null ? `${n} stops to go` : "On board",
        headline: `Sit back until ${alightName}`,
        body: at
          ? `Now at ${at}. Nothing to do yet, we're counting the stops for you.`
          : "Nothing to do yet, we're counting the stops for you.",
      };
  }
}
