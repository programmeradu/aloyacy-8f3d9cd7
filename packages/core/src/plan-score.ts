// One cost model for every planner surface.
//
// Before this module, four files each carried their own "duration + 120s per
// transfer + 0.4 × metres over 500" formula. That shape had two problems: it
// was duplicated (so the live search and the schedule search disagreed), and
// its numbers were invented rather than measured. It priced a cross-platform
// hop at a bus terminal exactly the same as a 500 m street change onto a
// once-an-hour route.
//
// What this model prices instead:
//
//   - door-to-door seconds, which already include every walk and wait;
//   - a *walking effort* premium proportional to distance actually walked
//     (continuous — no cliff at 500 m, because a 501 m walk is not suddenly
//     worse than a 499 m one);
//   - a per-change risk premium built from measured facts: how long that
//     specific interchange takes on foot, and the real headway of the route
//     being joined. Missing a 10-minute-headway bus costs ten minutes;
//     missing a 40-minute one costs forty. A change between two bays of the
//     same station, where the rider can see the next bus, is priced as the
//     short hop it is;
//   - observed unreliability (feed delay / learned history) for the routes
//     involved;
//   - a skip risk at the boarding stop, only when we already speak the skip
//     (expected extra wait = fraction × headway). The stop stays on the list.

// Nothing here filters options. Filtering is `filterDominated`, which drops an
// option only when another is measurably better on every axis a rider cares
// about.

/** What we know about one change in an itinerary. */
export type ChangeCost = {
  /** Measured seconds to get from the alighting bay to the boarding bay. */
  interchangeSec: number;
  /** Real headway of the route being joined, when the schedule tells us. */
  headwaySec: number | null;
  /** True when both bays belong to the same station. */
  sameStation: boolean;
};

export type ScoreInput = {
  totalDurationSec: number;
  /** Street walking, excluding in-station bay hops. */
  walkMeters: number;
  /** Metres walked between bays of one station. */
  inStationHopMeters?: number;
  changes: ChangeCost[];
  /** Seconds of observed lateness across the ride legs. */
  reliabilitySec?: number;
  /** Expected extra wait from a spoken skip at a boarding stop. */
  skipRiskSec?: number;
};

/** Effort premium per metre of street walking, on top of the time it costs. */
export const WALK_EFFORT_SEC_PER_M = 0.2;
/** Same, for a bay-to-bay hop inside one station — sheltered and signposted. */
export const IN_STATION_EFFORT_SEC_PER_M = 0.05;
/** Fixed cost of the act of changing: finding the bay, re-reading the sign. */
export const CHANGE_OVERHEAD_SEC = 60;
/** …reduced when the next bus is in sight at the same station. */
export const IN_STATION_CHANGE_OVERHEAD_SEC = 20;
/**
 * Share of a headway a rider risks when a connection breaks. Half a headway is
 * the expected wait for the following service.
 */
export const HEADWAY_RISK_SHARE = 0.5;
/** Cap so a once-a-day intercity link does not produce an absurd score. */
export const MAX_HEADWAY_RISK_SEC = 30 * 60;
/** Used only when the schedule genuinely has no second departure to measure. */
export const UNKNOWN_HEADWAY_SEC = 20 * 60;

export function changeRiskSec(change: ChangeCost): number {
  const headway = change.headwaySec ?? UNKNOWN_HEADWAY_SEC;
  const risk = Math.min(headway * HEADWAY_RISK_SHARE, MAX_HEADWAY_RISK_SEC);
  const overhead = change.sameStation ? IN_STATION_CHANGE_OVERHEAD_SEC : CHANGE_OVERHEAD_SEC;
  // A generous interchange window absorbs part of the risk: if you have eight
  // minutes to walk a two-minute connection, a small delay does not break it.
  const slackRelief = change.sameStation ? 0.5 : 0.25;
  return Math.max(0, risk * (1 - slackRelief) + overhead);
}

export function skipRiskSec(fraction: number, headwaySec: number | null): number {
  if (!(fraction > 0) || fraction > 1) return 0;
  const hw = headwaySec != null && headwaySec > 0 ? headwaySec : UNKNOWN_HEADWAY_SEC;
  return Math.round(fraction * Math.min(hw, MAX_HEADWAY_RISK_SEC));
}

export function scoreItinerary(input: ScoreInput): number {
  const walkEffort = input.walkMeters * WALK_EFFORT_SEC_PER_M;
  const hopEffort = (input.inStationHopMeters ?? 0) * IN_STATION_EFFORT_SEC_PER_M;
  const changeCost = input.changes.reduce((acc, c) => acc + changeRiskSec(c), 0);
  const reliability = (input.reliabilitySec ?? 0) * 0.5;
  return (
    input.totalDurationSec + walkEffort + hopEffort + changeCost + reliability + (input.skipRiskSec ?? 0)
  );
}

// ---- dominance --------------------------------------------------------------

/** The axes a rider actually compares two options on. */
export type Comparable = {
  arrivalUnix: number;
  transfers: number;
  totalWalkMeters: number;
};

/** A minute of arrival and 75 m of walking are within noise of each other. */
export const ARRIVAL_TOLERANCE_SEC = 60;
export const WALK_TOLERANCE_M = 75;

/**
 * `a` dominates `b` when it is at least as good on arrival, changes and
 * walking — and clearly better on one of them. This is the only pruning the
 * planner does: an option disappears because something measurably beats it,
 * never because of its shape.
 */
export function dominates(a: Comparable, b: Comparable): boolean {
  const arrivalOk = a.arrivalUnix <= b.arrivalUnix + ARRIVAL_TOLERANCE_SEC;
  const changesOk = a.transfers <= b.transfers;
  const walkOk = a.totalWalkMeters <= b.totalWalkMeters + WALK_TOLERANCE_M;
  if (!arrivalOk || !changesOk || !walkOk) return false;
  const strictlyBetter =
    a.arrivalUnix < b.arrivalUnix - ARRIVAL_TOLERANCE_SEC ||
    a.transfers < b.transfers ||
    a.totalWalkMeters < b.totalWalkMeters - WALK_TOLERANCE_M;
  return strictlyBetter;
}

/** Keep the Pareto front: every option no other option beats outright. */
export function filterDominated<T extends Comparable>(options: T[]): T[] {
  return options.filter((candidate, i) =>
    options.every((other, j) => i === j || !dominates(other, candidate)),
  );
}

// ---- final ranking ------------------------------------------------------------
//
// `scoreItinerary` prices time, walking effort and the risk of each change. On
// its own it let a five-bus journey ending 1.3 km short of an airport outrank
// a cleaner one, because a change was only worth a minute or two of overhead
// and the last walk was priced like any other. Riders do not see it that way:
// every extra bus is a fresh chance to be stranded, and an option that leaves
// them a long walk from the door has not really arrived. So the final rank
// adds, on top of the score:
//
//   - a flat premium per change (on top of the measured change risk);
//   - extra effort for walking beyond what most trips need;
//   - a steep premium for every metre of the final walk past "at the door",
//     and a further one when an airport trip stops short of the terminal.

/** Flat premium per change, on top of `changeRiskSec`. */
export const RANK_TRANSFER_SEC = 9 * 60;
/** Street walking up to this carries no extra premium. */
export const RANK_FREE_WALK_M = 600;
/** Extra seconds per metre walked past `RANK_FREE_WALK_M`. */
export const RANK_WALK_SEC_PER_M = 0.5;
/** The final walk counts as "at the door" up to this. */
export const RANK_DOOR_M = 350;
/** Extra seconds per metre of final walk past `RANK_DOOR_M`. */
export const RANK_EGRESS_SEC_PER_M = 1.2;
/** A final walk past this has not really arrived: flat premium. */
export const RANK_FAR_EGRESS_M = 900;
export const RANK_FAR_EGRESS_SEC = 20 * 60;
/** Airport trips: the last bus must stop this close to the terminal. */
export const RANK_AIRPORT_EGRESS_M = 450;
export const RANK_AIRPORT_SHORT_SEC = 45 * 60;

type RankLeg = { kind: string; distanceMeters?: number };

/** Final walk in metres: the walk legs after the last ride. */
export function egressMeters(legs: ReadonlyArray<RankLeg>): number {
  let m = 0;
  for (let i = legs.length - 1; i >= 0; i--) {
    const l = legs[i];
    if (l.kind === "ride") break;
    if (l.kind === "walk") m += l.distanceMeters ?? 0;
  }
  return m;
}

/**
 * Seconds added to an itinerary's score for the final rank. Pure: depends only
 * on the legs, so every planner (browser timetable, live, mixed) ranks the same
 * option the same way. `airportShort` is the caller's verdict that an airport
 * trip's last bus stops away from the terminal.
 */
export function rankPenaltySec(
  it: { transfers: number; totalWalkMeters: number; legs: ReadonlyArray<RankLeg> },
  opts?: { airportShort?: boolean },
): number {
  let p = it.transfers * RANK_TRANSFER_SEC;
  p += Math.max(0, it.totalWalkMeters - RANK_FREE_WALK_M) * RANK_WALK_SEC_PER_M;
  const egress = egressMeters(it.legs);
  p += Math.max(0, egress - RANK_DOOR_M) * RANK_EGRESS_SEC_PER_M;
  if (egress > RANK_FAR_EGRESS_M) p += RANK_FAR_EGRESS_SEC;
  if (opts?.airportShort) p += RANK_AIRPORT_SHORT_SEC;
  return Math.round(p);
}
