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

// ---------------------------------------------------------------------------
// Leave-time buffer
// ---------------------------------------------------------------------------

export type BufferReason = {
  kind: "weather" | "traffic" | "rush" | "disruption";
  sec: number;
  /** Short human phrase, already localised into English. */
  label: string;
};

export type BufferResult = {
  extraSec: number;
  reasons: BufferReason[];
  /** One-line summary, or null when nothing meaningful applies. */
  reasonShort: string | null;
};

/** Per-component ceilings so one noisy signal can't dominate. */
export const BUFFER_CAPS = {
  weather: 7 * 60,
  traffic: 8 * 60,
  rush: 6 * 60,
  disruption: 10 * 60,
  total: 20 * 60,
} as const;

/**
 * Cyprus default congestion curve, in seconds of extra journey time by local
 * hour. Morning commute, the 13:00-14:00 school run (a real, sharp peak here),
 * and the evening return. Used until we have enough learned samples.
 */
const DEFAULT_RUSH_CURVE: Record<number, number> = {
  7: 150,
  8: 240,
  9: 120,
  13: 210,
  14: 180,
  17: 180,
  18: 240,
  19: 150,
};

export type RushProfile = {
  /** 0 = Sunday … 6 = Saturday, matching JS getDay(). */
  dayOfWeek: number;
  hourOfDay: number;
  meanDelaySec: number;
  sampleCount: number;
};

/**
 * Extra seconds to expect from time-of-day congestion. Prefers our own
 * learned profile for that weekday+hour once it has enough samples, and
 * otherwise falls back to the island default curve. Weekends and public
 * holidays are quiet, so the default curve is muted there.
 */
export function rushHourFactor(args: {
  hourOfDay: number;
  dayOfWeek: number;
  isHoliday?: boolean;
  profile?: readonly RushProfile[];
}): number {
  const { hourOfDay, dayOfWeek, isHoliday = false, profile = [] } = args;
  const learned = profile.find(
    (p) => p.hourOfDay === hourOfDay && p.dayOfWeek === dayOfWeek && p.sampleCount >= 8,
  );
  if (learned) {
    // The learned mean already contains the baseline lateness the traffic
    // component covers; only the part above two minutes is rush-specific.
    return clamp(Math.round(learned.meanDelaySec - 120), 0, BUFFER_CAPS.rush);
  }
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  const base = DEFAULT_RUSH_CURVE[hourOfDay] ?? 0;
  if (isHoliday || dayOfWeek === 0) return 0;
  return clamp(Math.round(weekend ? base * 0.3 : base), 0, BUFFER_CAPS.rush);
}

export type BufferSignals = {
  /** Already-computed weather allowance (see leave-time-adjuster). */
  weatherSec?: number;
  weatherLabel?: string | null;
  /** Recent mean lateness across the routes in the plan. */
  trafficSec?: number;
  rushSec?: number;
  /** Active incident/disruption touching one of the routes. */
  disruptionSec?: number;
  disruptionLabel?: string | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function minutes(sec: number): number {
  return Math.round(sec / 60);
}

/**
 * Merge every signal into one buffer the rider can audit. Components are
 * capped individually and again in total, and only the ones worth at least a
 * minute earn a line in the explanation — "leave 8 min earlier" is useful,
 * "leave 40 seconds earlier" is noise.
 */
export function composeLeaveBuffer(signals: BufferSignals): BufferResult {
  const reasons: BufferReason[] = [];

  const weather = clamp(signals.weatherSec ?? 0, 0, BUFFER_CAPS.weather);
  if (weather >= 60) {
    reasons.push({
      kind: "weather",
      sec: weather,
      label: signals.weatherLabel?.trim() || "weather",
    });
  }

  const traffic = clamp(signals.trafficSec ?? 0, 0, BUFFER_CAPS.traffic);
  if (traffic >= 60) reasons.push({ kind: "traffic", sec: traffic, label: "buses running late" });

  const rush = clamp(signals.rushSec ?? 0, 0, BUFFER_CAPS.rush);
  if (rush >= 60) reasons.push({ kind: "rush", sec: rush, label: "rush hour" });

  const disruption = clamp(signals.disruptionSec ?? 0, 0, BUFFER_CAPS.disruption);
  if (disruption >= 60) {
    reasons.push({
      kind: "disruption",
      sec: disruption,
      label: signals.disruptionLabel?.trim() || "road disruption",
    });
  }

  const raw = weather + traffic + rush + disruption;
  const extraSec = Math.min(BUFFER_CAPS.total, raw);

  const reasonShort =
    reasons.length === 0
      ? null
      : `${reasons.map((r) => r.label).join(" + ")} — leave ${minutes(extraSec)} min earlier`;

  return { extraSec, reasons, reasonShort };
}

// ---------------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------------

export type NudgeKind = "t60" | "t30" | "t15" | "now" | "changed" | "unmakeable";

export type PromiseStatus =
  | "watching"
  | "leave-now"
  | "departed"
  | "missed"
  | "cancelled"
  | "done";

export type PromiseSnapshot = {
  leaveByUnix: number;
  /** Leave time when the promise was created — used to detect drift. */
  baselineLeaveByUnix: number;
  targetArrivalUnix: number;
  status: PromiseStatus;
  nudgesSent: readonly string[];
  /** True when the current ladder can no longer make the target. */
  unmakeable?: boolean;
};

/** Escalation points, in seconds before the recommended leave time. */
export const NUDGE_STEPS: Array<{ kind: NudgeKind; leadSec: number }> = [
  { kind: "t60", leadSec: 60 * 60 },
  { kind: "t30", leadSec: 30 * 60 },
  { kind: "t15", leadSec: 15 * 60 },
  { kind: "now", leadSec: 0 },
];

/** A leave time moving this much earlier is worth an out-of-band ping. */
export const DRIFT_ALERT_SEC = 5 * 60;

/**
 * Which single nudge is due right now, or null. Idempotent: anything already
 * in nudgesSent is never returned again, so a re-run of the cron tick after a
 * crash cannot double-notify.
 *
 * Priority is honesty-first: "you can no longer make it" outranks "leave now",
 * which outranks the fixed countdown steps, which outrank drift.
 */
export function nextNudge(p: PromiseSnapshot, nowUnix: number): NudgeKind | null {
  if (p.status !== "watching" && p.status !== "leave-now") return null;
  const sent = new Set(p.nudgesSent);

  if (p.unmakeable && !sent.has("unmakeable")) return "unmakeable";

  const secUntilLeave = p.leaveByUnix - nowUnix;

  // Too late to act on: don't fire a stale "leave now" hours after the fact.
  if (secUntilLeave < -15 * 60) return null;

  for (const step of NUDGE_STEPS) {
    if (secUntilLeave <= step.leadSec && !sent.has(step.kind)) {
      // Never fire a lead-time step that was already overtaken by a closer
      // one (e.g. the promise was created 20 min before departure: t60 and
      // t30 are moot, t15 is the right first ping).
      const closer = NUDGE_STEPS.find(
        (s) => s.leadSec < step.leadSec && secUntilLeave <= s.leadSec && !sent.has(s.kind),
      );
      if (closer) continue;
      return step.kind;
    }
  }

  // Conditions worsened enough that the plan itself changed.
  if (
    !sent.has("changed") &&
    p.baselineLeaveByUnix - p.leaveByUnix >= DRIFT_ALERT_SEC &&
    secUntilLeave > 0
  ) {
    return "changed";
  }

  return null;
}

export function promiseStatusFor(p: {
  leaveByUnix: number;
  targetArrivalUnix: number;
  status: PromiseStatus;
  unmakeable?: boolean;
}, nowUnix: number): PromiseStatus {
  if (p.status === "cancelled" || p.status === "departed" || p.status === "done") return p.status;
  if (nowUnix > p.targetArrivalUnix) return "done";
  if (p.unmakeable) return "missed";
  if (nowUnix >= p.leaveByUnix) return "leave-now";
  return "watching";
}

// ---------------------------------------------------------------------------
// Watch cadence
// ---------------------------------------------------------------------------

/**
 * How often to re-plan, given how far out the departure is. Far-off promises
 * barely move, so re-planning them every two minutes would burn the planner
 * for nothing; the last hour is where accuracy actually matters.
 */
export function replanIntervalSec(secUntilLeave: number): number {
  if (secUntilLeave <= 60 * 60) return 0; // every tick
  if (secUntilLeave <= 6 * 60 * 60) return 15 * 60;
  return 60 * 60;
}

export function isReplanDue(args: {
  nowUnix: number;
  leaveByUnix: number;
  lastReplanUnix: number | null;
}): boolean {
  const interval = replanIntervalSec(args.leaveByUnix - args.nowUnix);
  if (args.lastReplanUnix == null) return true;
  return args.nowUnix - args.lastReplanUnix >= interval;
}

// ---------------------------------------------------------------------------
// Copy — one source of truth for web, native and push bodies
// ---------------------------------------------------------------------------

export function formatClock(unix: number, timeZone = "Asia/Nicosia"): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(unix * 1000));
}

export function formatDayLabel(unix: number, nowUnix: number, timeZone = "Asia/Nicosia"): string {
  const day = (u: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(u * 1000));
  const today = day(nowUnix);
  const target = day(unix);
  if (target === today) return "today";
  if (target === day(nowUnix + 86_400)) return "tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "short" })
    .format(new Date(unix * 1000));
}

export function rungLine(rung: LadderRung, timeZone = "Asia/Nicosia"): string {
  const slack = Math.abs(minutes(rung.slackSec));
  const tail =
    rung.slackSec < 0
      ? `${slack} min too late`
      : slack === 0
        ? "cutting it fine"
        : `${slack} min to spare`;
  return `Leave ${formatClock(rung.leaveByUnix, timeZone)} → arrive ${formatClock(rung.arrivalUnix, timeZone)} · ${tail}`;
}

export type NudgeCopy = { title: string; body: string };

export function nudgeCopy(args: {
  kind: NudgeKind;
  destinationLabel: string;
  targetArrivalUnix: number;
  leaveByUnix: number;
  routes: readonly string[];
  reasonShort?: string | null;
  earliestArrivalUnix?: number | null;
  timeZone?: string;
}): NudgeCopy {
  const tz = args.timeZone ?? "Asia/Nicosia";
  const target = formatClock(args.targetArrivalUnix, tz);
  const leave = formatClock(args.leaveByUnix, tz);
  const dest = args.destinationLabel;
  const route = args.routes[0] ? ` — BUS ${args.routes[0]}` : "";
  const reason = args.reasonShort ? ` ${args.reasonShort}.` : "";

  switch (args.kind) {
    case "t60":
      return {
        title: `${dest} by ${target}`,
        body: `Leave at ${leave} (in about an hour)${route ? `, taking${route.replace(" —", "")}` : ""}.${reason}`,
      };
    case "t30":
      return {
        title: `30 minutes until you leave`,
        body: `Set off at ${leave} to reach ${dest} by ${target}.${reason}`,
      };
    case "t15":
      return {
        title: `15 minutes until you leave`,
        body: `Start heading out at ${leave} for ${dest} by ${target}.${reason}`,
      };
    case "now":
      return {
        title: `Time to head out${route}`,
        body: `Leave now to reach ${dest} by ${target}.${reason}`,
      };
    case "changed":
      return {
        title: `Leave earlier for ${dest}`,
        body: `New leave time ${leave}.${reason || ` Conditions changed on your route.`}`,
      };
    case "unmakeable":
      return {
        title: `${target} looks out of reach`,
        body: args.earliestArrivalUnix
          ? `The earliest bus arrival at ${dest} is now ${formatClock(args.earliestArrivalUnix, tz)}. Tap to see other options.`
          : `No bus service now reaches ${dest} by ${target}. Tap to see other options.`,
      };
  }
}

export function promiseHeadline(args: {
  destinationLabel: string;
  targetArrivalUnix: number;
  nowUnix: number;
  timeZone?: string;
}): string {
  const tz = args.timeZone ?? "Asia/Nicosia";
  return `${args.destinationLabel} by ${formatClock(args.targetArrivalUnix, tz)} ${formatDayLabel(args.targetArrivalUnix, args.nowUnix, tz)}`;
}

/** "leave in 42 min" / "leave now" / "left 5 min ago" — never a bare number. */
export function countdownLabel(leaveByUnix: number, nowUnix: number): string {
  const sec = leaveByUnix - nowUnix;
  if (sec <= 0 && sec > -60) return "leave now";
  if (sec <= -60) return `leave time passed ${minutes(-sec)} min ago`;
  if (sec < 60) return "leave in under a minute";
  const mins = minutes(sec);
  if (mins < 90) return `leave in ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `leave in ${hours} h` : `leave in ${hours} h ${rem} min`;
}

/**
 * Explain the safety buffer without sounding like a contradiction. "Leave 6
 * min earlier" on its own reads as if leaving early makes you late; naming the
 * departure it is measured against ("the 03:39 option") makes it obvious the
 * buffer is padding on the walk, not a worse plan.
 */
export function bufferNote(args: {
  bufferSec: number;
  reasonShort?: string | null;
  /** Leave time of the option the promise is anchored on, before padding. */
  scheduledLeaveUnix?: number | null;
  timeZone?: string;
}): string | null {
  const mins = Math.round((args.bufferSec ?? 0) / 60);
  if (mins < 1) return args.reasonShort ? `${capitalise(args.reasonShort)}.` : null;
  const tz = args.timeZone ?? "Asia/Nicosia";
  const anchor =
    args.scheduledLeaveUnix != null
      ? ` ahead of the ${formatClock(args.scheduledLeaveUnix, tz)} option`
      : "";
  const why = args.reasonShort ? ` — ${args.reasonShort}` : "";
  return `Set off ${mins} min${anchor} as a cushion${why}.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
