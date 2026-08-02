// "Get me to Larnaca by 16:00 tomorrow."
//
// An *arrival promise* is a commitment the rider makes and Aloya keeps
// watching: a target arrival time, an origin and a destination. Until the
// rider leaves, a server-side watcher re-plans the trip, recomputes how much
// earlier they should set off given weather, recent route delays, rush hour
// and active disruptions, and nudges them at fixed escalation points.
//
// Everything in this file is pure so the exact same rules — the ladder, the
// buffer maths, the nudge escalation, the copy — run on the web, in the
// native app and inside the cron worker, and can be unit-tested without a
// database, a clock, or a network.

// ---------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------

/** How close to the target the rider is willing to cut it. */
export type MarginPref = "relaxed" | "normal" | "tight";

/** Seconds of slack the rider wants between arriving and the target time. */
export const MARGIN_SEC: Record<MarginPref, number> = {
  relaxed: 20 * 60,
  normal: 10 * 60,
  tight: 2 * 60,
};

export type LadderVerdict = "comfortable" | "tight" | "late";

/** Minimal structural shape of an itinerary — matches the planner DTO. */
export type ItineraryLike = {
  id: string;
  departureUnix: number;
  arrivalUnix: number;
  totalDurationSec: number;
  transfers: number;
  legs: ReadonlyArray<{
    kind: string;
    routeShort?: string;
    durationSec?: number;
  }>;
  source?: string;
};

export type LadderRung = {
  itineraryId: string;
  /** When the rider must physically set off (includes the access walk). */
  leaveByUnix: number;
  arrivalUnix: number;
  /** Seconds between arriving and the target. Negative means late. */
  slackSec: number;
  verdict: LadderVerdict;
  transfers: number;
  /** Route chain, e.g. ["30", "410"] — walk-only trips give []. */
  routes: string[];
  /** True for the rung we recommend. */
  recommended: boolean;
};

/**
 * Where the rider must set off from: departure of the first ride minus every
 * walk/wait leg that happens before it. Walk-only trips leave immediately.
 */
export function leaveByUnixFor(it: ItineraryLike): number {
  let preRideSec = 0;
  for (const leg of it.legs) {
    if (leg.kind === "ride") break;
    preRideSec += typeof leg.durationSec === "number" ? leg.durationSec : 0;
  }
  const firstRide = it.legs.find((l) => l.kind === "ride");
  if (!firstRide) return it.departureUnix;
  return it.departureUnix - preRideSec;
}

export function routeChain(it: ItineraryLike): string[] {
  const out: string[] = [];
  for (const leg of it.legs) {
    if (leg.kind === "ride" && leg.routeShort) out.push(leg.routeShort);
  }
  return out;
}

function verdictFor(slackSec: number, marginSec: number): LadderVerdict {
  if (slackSec < 0) return "late";
  return slackSec >= marginSec ? "comfortable" : "tight";
}

/**
 * Turn planner output into the rider-facing ladder:
 * "leave 14:35 → arrive 15:48, 12 min to spare".
 *
 * Rungs are ordered by departure so the list reads like a timetable. The
 * recommendation is the *latest* option that still clears the rider's margin —
 * nobody wants to leave two hours early when one hour does the job. When
 * nothing clears the margin we recommend the least-late option so the screen
 * still answers "what is my best shot?" instead of going blank.
 */
export function buildDepartureLadder(
  itineraries: readonly ItineraryLike[],
  targetArrivalUnix: number,
  margin: MarginPref = "normal",
  maxRungs = 4,
): LadderRung[] {
  const marginSec = MARGIN_SEC[margin];
  const seen = new Set<number>();
  const all: LadderRung[] = [];

  for (const it of itineraries) {
    const leaveByUnix = leaveByUnixFor(it);
    // Collapse near-identical departures (same minute) — they read as noise.
    const bucket = Math.round(leaveByUnix / 60);
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    const slackSec = targetArrivalUnix - it.arrivalUnix;
    all.push({
      itineraryId: it.id,
      leaveByUnix,
      arrivalUnix: it.arrivalUnix,
      slackSec,
      verdict: verdictFor(slackSec, marginSec),
      transfers: it.transfers,
      routes: routeChain(it),
      recommended: false,
    });
  }

  all.sort((a, b) => a.leaveByUnix - b.leaveByUnix);
  if (all.length === 0) return [];

  // Drop dominated options. "Leave 02:17 → arrive 10:46" next to
  // "Leave 03:39 → arrive 09:48" reads as nonsense: the earlier departure
  // costs the rider 82 extra minutes at home *and* lands later (it sits out a
  // long transfer). Keep an option only when nothing that leaves later or at
  // the same minute also arrives no later.
  const kept: LadderRung[] = [];
  let bestArrival = Number.POSITIVE_INFINITY;
  for (let i = all.length - 1; i >= 0; i--) {
    const r = all[i];
    if (r.arrivalUnix >= bestArrival) continue;
    bestArrival = r.arrivalUnix;
    kept.unshift(r);
  }
  all.length = 0;
  all.push(...kept);

  const onTime = all.filter((r) => r.slackSec >= marginSec);

  const pick = onTime.length
    ? onTime[onTime.length - 1]
    : // least late / closest to the target
      all.reduce((best, r) => (Math.abs(r.slackSec) < Math.abs(best.slackSec) ? r : best), all[0]);

  // Keep the recommendation plus the rungs closest to it in time.
  const trimmed =
    all.length <= maxRungs
      ? all
      : all
          .slice()
          .sort(
            (a, b) =>
              Math.abs(a.leaveByUnix - pick.leaveByUnix) -
              Math.abs(b.leaveByUnix - pick.leaveByUnix),
          )
          .slice(0, maxRungs)
          .sort((a, b) => a.leaveByUnix - b.leaveByUnix);

  return trimmed.map((r) => ({ ...r, recommended: r.itineraryId === pick.itineraryId }));
}

export function recommendedRung(ladder: readonly LadderRung[]): LadderRung | null {
  return ladder.find((r) => r.recommended) ?? ladder[0] ?? null;
}

/** True when no option in the ladder actually lands before the target. */
export function isUnmakeable(ladder: readonly LadderRung[]): boolean {
  return ladder.length > 0 && ladder.every((r) => r.slackSec < 0);
}
