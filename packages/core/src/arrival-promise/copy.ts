import type { LadderRung } from "./ladder";
import type { NudgeKind } from "./nudges";
import { minutes, capitalise } from "./util";

// Rider-facing copy — one source of truth for web, native and push bodies.

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
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(u * 1000));
  const today = day(nowUnix);
  const target = day(unix);
  if (target === today) return "today";
  if (target === day(nowUnix + 86_400)) return "tomorrow";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(unix * 1000));
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
