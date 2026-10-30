// "16:00 is out of reach — how much later would actually work?"
//
// When no departure in the ladder lands before the target, a blank apology is
// useless: the rider wants a number. This module turns the measured ladder
// (real arrivals from the planner) plus the conditions buffer (weather,
// traffic, rush, disruptions already priced into the leave time) into two or
// three concrete "move your arrival by N minutes" options.
//
// Pure — the same suggestion renders on web, in the native app, and can be
// unit-tested without a clock or a network.

import { MARGIN_SEC, type LadderRung, type LadderVerdict, type MarginPref } from "./ladder";
import { formatClock } from "./copy";
import { minutes } from "./util";

/** Rounding step for a rider-facing "+N min" — nobody negotiates in seconds. */
const STEP_SEC = 5 * 60;

/** Never suggest pushing an arrival more than this far out in one tap. */
export const MAX_SHIFT_SEC = 4 * 3600;

/** Fallbacks when the planner returned nothing at all to measure against. */
const BLIND_SHIFTS_SEC = [15 * 60, 30 * 60, 60 * 60];

export type ShiftKind = "minimum" | "suggested" | "comfortable";

export type ShiftOption = {
  kind: ShiftKind;
  /** Seconds to add to the current target. Always a multiple of 5 minutes. */
  extraSec: number;
  newTargetUnix: number;
  /** Spare time against the new target for the best measured option. */
  slackSec: number | null;
  verdict: LadderVerdict | null;
};

export type ArrivalShiftSuggestion = {
  /** How late the best measured option lands, in seconds. 0 when unmeasured. */
  shortfallSec: number;
  /** Earliest arrival any option in the ladder can achieve, if we know one. */
  reachableArrivalUnix: number | null;
  /** True when we had no measured itinerary and are offering blind steps. */
  blind: boolean;
  options: ShiftOption[];
  recommended: ShiftOption | null;
};

function roundUpStep(sec: number): number {
  return Math.max(STEP_SEC, Math.ceil(sec / STEP_SEC) * STEP_SEC);
}

/**
 * Best measured rung when everything is late: the one that lands closest to
 * the target (largest, i.e. least negative, slack).
 */
function leastLate(ladder: readonly LadderRung[]): LadderRung | null {
  let best: LadderRung | null = null;
  for (const r of ladder) if (!best || r.slackSec > best.slackSec) best = r;
  return best;
}

/**
 * How much later the rider would have to accept arriving, and what each option
 * buys them.
 *
 * `bufferSec` is the conditions padding the watcher already computed — a shift
 * that ignores it would be "just enough" on paper and late on the road, so the
 * suggested and comfortable options carry it.
 *
 * Returns null when the promise is already makeable (nothing to negotiate) or
 * when every option would exceed the watch horizon.
 */
export function suggestArrivalShift(args: {
  ladder: readonly LadderRung[];
  targetArrivalUnix: number;
  margin: MarginPref;
  bufferSec?: number;
  nowUnix: number;
  /** Furthest ahead the watcher will hold a promise. Defaults to 8 days. */
  maxHorizonSec?: number;
}): ArrivalShiftSuggestion | null {
  const {
    ladder,
    targetArrivalUnix,
    margin,
    bufferSec = 0,
    nowUnix,
    maxHorizonSec = 8 * 24 * 3600,
  } = args;

  const best = leastLate(ladder);
  // Something already lands on time — there is nothing to adjust.
  if (best && best.slackSec >= 0) return null;

  const horizonUnix = nowUnix + maxHorizonSec;
  const marginSec = MARGIN_SEC[margin];
  const blind = !best;

  const rawShifts = blind
    ? BLIND_SHIFTS_SEC
    : [
        // Just enough to land, with a minute of grace against rounding.
        -best!.slackSec + 60,
        // Enough to land with the conditions padding actually holding.
        -best!.slackSec + Math.max(bufferSec, 120) + 120,
        // Enough to arrive with the rider's own chosen spare time intact.
        -best!.slackSec + bufferSec + marginSec,
      ];

  const kinds: ShiftKind[] = ["minimum", "suggested", "comfortable"];
  const seen = new Set<number>();
  const options: ShiftOption[] = [];

  rawShifts.forEach((raw, i) => {
    const extraSec = Math.min(roundUpStep(raw), MAX_SHIFT_SEC);
    if (seen.has(extraSec)) return;
    const newTargetUnix = targetArrivalUnix + extraSec;
    if (newTargetUnix > horizonUnix) return;
    if (newTargetUnix <= nowUnix + 300) return;
    seen.add(extraSec);
    const slackSec = best ? newTargetUnix - best.arrivalUnix : null;
    options.push({
      kind: kinds[i] ?? "suggested",
      extraSec,
      newTargetUnix,
      slackSec,
      verdict:
        slackSec == null
          ? null
          : slackSec < 0
            ? "late"
            : slackSec >= marginSec
              ? "comfortable"
              : "tight",
    });
  });

  if (options.length === 0) return null;

  // Recommend the middle ground when we have it: lands with the conditions
  // padding intact without asking the rider to give up their whole afternoon.
  const recommended =
    options.find((o) => o.kind === "suggested") ??
    options.find((o) => o.verdict !== "late") ??
    options[0];

  return {
    shortfallSec: best ? -best.slackSec : 0,
    reachableArrivalUnix: best ? best.arrivalUnix : null,
    blind,
    options,
    recommended,
  };
}

/** "The earliest we can land you is 16:18 — 18 min past your 16:00." */
export function shiftHeadline(
  suggestion: ArrivalShiftSuggestion,
  targetArrivalUnix: number,
  timeZone?: string,
): string {
  if (suggestion.blind || suggestion.reachableArrivalUnix == null) {
    return `No option reaches you by ${formatClock(targetArrivalUnix, timeZone)} yet. Give the trip a little more room and we will keep watching.`;
  }
  return `The earliest we can land you is ${formatClock(suggestion.reachableArrivalUnix, timeZone)} · ${minutes(
    suggestion.shortfallSec,
  )} min past your ${formatClock(targetArrivalUnix, timeZone)}.`;
}

/** "+20 min · by 16:20 · 4 min spare" */
export function shiftOptionLine(option: ShiftOption, timeZone?: string): string {
  const head = `+${minutes(option.extraSec)} min · by ${formatClock(option.newTargetUnix, timeZone)}`;
  if (option.slackSec == null) return head;
  if (option.slackSec < 0) return `${head} · still ${minutes(-option.slackSec)} min short`;
  return `${head} · ${minutes(option.slackSec)} min spare`;
}

/** Short chip label — "Just enough" / "Recommended" / "Comfortable". */
export function shiftOptionName(kind: ShiftKind): string {
  return kind === "minimum" ? "Just enough" : kind === "suggested" ? "Recommended" : "Comfortable";
}
