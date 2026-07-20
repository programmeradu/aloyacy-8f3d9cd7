/**
 * Dynamic time shortcuts for the trip planner's "Leave / Arrive by" control.
 *
 * Static chips ("Today 17:00") go stale the moment the clock passes them and
 * mean nothing to a rider whose day doesn't look like that. These presets are
 * derived from three honest signals instead:
 *
 *   1. habit    — times this rider has actually planned for before, bucketed
 *                 by quarter-hour and weekday/weekend so a 07:45 weekday
 *                 commute never bleeds into Sunday.
 *   2. rhythm   — the island's daily anchors (morning, midday, evening,
 *                 late) — but only the ones still ahead of the rider.
 *   3. soon     — a near-term slot rounded to the quarter hour, so "in a bit"
 *                 is always one tap away.
 *
 * Pure and time-injectable: every caller passes `nowMs`, nothing reads the
 * clock itself, so this is fully testable and SSR-safe.
 */

import { cyAddDays, cyDayDiff, cyIsWeekend, cyParts, cyWallToMs } from "./cy-time";

export type TimePresetMode = "leave" | "arrive";

/** One past use of the time control (target time, not when it was typed). */
export type TimeUsage = {
  /** The time the rider planned for, epoch ms. */
  atMs: number;
  mode: TimePresetMode;
};

export type TimePreset = {
  iso: string;
  /** Which day the preset lands on, relative to now. */
  dayKey: "today" | "tomorrow" | "later";
  /** 0=Sunday … 6=Saturday, for the "later" label. */
  weekday: number;
  /** Local wall clock, 24h, e.g. "17:15". */
  timeLabel: string;
  source: "habit" | "rhythm" | "soon";
};

/** Anchors of a Cyprus day, per intent. Kept small — three chips is the cap. */
const RHYTHM: Record<TimePresetMode, { h: number; m: number }[]> = {
  // When you want to *be* somewhere: work start, after lunch, end of day, night out.
  arrive: [
    { h: 8, m: 30 },
    { h: 13, m: 0 },
    { h: 17, m: 0 },
    { h: 20, m: 0 },
  ],
  // When you want to *set off*: earlier by design.
  leave: [
    { h: 7, m: 45 },
    { h: 12, m: 30 },
    { h: 16, m: 30 },
    { h: 19, m: 30 },
  ],
};

const MIN_LEAD_MS: Record<TimePresetMode, number> = {
  arrive: 30 * 60_000,
  leave: 10 * 60_000,
};

const HABIT_WINDOW_MS = 90 * 24 * 60 * 60_000;
const DEDUPE_MS = 25 * 60_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** Next occurrence of a wall-clock time that is at least `minMs` in the future. */
function nextAt(
  nowMs: number,
  h: number,
  m: number,
  minMs: number,
  weekendMatch?: boolean,
): number {
  for (let add = 0; add < 8; add++) {
    const at = cyAddDays(nowMs, add, h, m);
    if (at < nowMs + minMs) continue;
    if (weekendMatch !== undefined && cyIsWeekend(at) !== weekendMatch) continue;
    return at;
  }
  return 0;
}

function describe(nowMs: number, atMs: number, source: TimePreset["source"]): TimePreset {
  const p = cyParts(atMs);
  const dayDiff = cyDayDiff(nowMs, atMs);
  return {
    iso: new Date(atMs).toISOString(),
    dayKey: dayDiff <= 0 ? "today" : dayDiff === 1 ? "tomorrow" : "later",
    weekday: p.weekday,
    timeLabel: `${pad(p.hour)}:${pad(p.minute)}`,
    source,
  };
}

/**
 * Rank the rider's own past times: quarter-hour buckets, split weekday vs
 * weekend, most-used first. A single one-off use is noise, so a bucket needs
 * either two uses or to be the only thing we know about this rider.
 */
function habitSlots(
  nowMs: number,
  mode: TimePresetMode,
  history: TimeUsage[],
): { h: number; m: number; weekend: boolean }[] {
  const relevant = history.filter(
    (u) => u.mode === mode && Number.isFinite(u.atMs) && nowMs - u.atMs < HABIT_WINDOW_MS,
  );
  if (relevant.length === 0) return [];

  const buckets = new Map<
    string,
    { h: number; m: number; weekend: boolean; n: number; last: number }
  >();
  for (const u of relevant) {
    const p = cyParts(u.atMs);
    const m = Math.round(p.minute / 15) * 15;
    const h = (p.hour + (m === 60 ? 1 : 0)) % 24;
    const weekend = cyIsWeekend(u.atMs);
    const key = `${weekend ? "e" : "d"}-${h}-${m % 60}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.n += 1;
      prev.last = Math.max(prev.last, u.atMs);
    } else {
      buckets.set(key, { h, m: m % 60, weekend, n: 1, last: u.atMs });
    }
  }

  const minCount = relevant.length >= 3 ? 2 : 1;
  return [...buckets.values()]
    .filter((b) => b.n >= minCount)
    .sort((a, b) => b.n - a.n || b.last - a.last)
    .slice(0, 2)
    .map(({ h, m, weekend }) => ({ h, m, weekend }));
}

export function buildTimePresets(opts: {
  nowMs: number;
  mode: TimePresetMode;
  history?: TimeUsage[];
  /** How many chips to return. Default 3 — more than that crowds the row. */
  max?: number;
}): TimePreset[] {
  const { nowMs, mode } = opts;
  const max = opts.max ?? 3;
  const minLead = MIN_LEAD_MS[mode];
  const out: TimePreset[] = [];

  const push = (atMs: number, source: TimePreset["source"]) => {
    if (!atMs || atMs < nowMs + minLead) return;
    if (out.some((p) => Math.abs(new Date(p.iso).getTime() - atMs) < DEDUPE_MS)) return;
    out.push(describe(nowMs, atMs, source));
  };

  // 1. The rider's own habits win the first slots.
  for (const slot of habitSlots(nowMs, mode, opts.history ?? [])) {
    push(nextAt(nowMs, slot.h, slot.m, minLead, slot.weekend), "habit");
  }

  // 2. A near-term slot, rounded to the quarter hour, so "soon" is one tap.
  const soonRaw = nowMs + (mode === "arrive" ? 60 : 25) * 60_000;
  const sp = cyParts(soonRaw);
  push(
    cyWallToMs(sp.year, sp.month, sp.day, sp.hour, 0) + Math.ceil(sp.minute / 15) * 15 * 60_000,
    "soon",
  );

  // 3. Fill the rest with the next daily anchors still ahead of the rider.
  for (const a of RHYTHM[mode]) {
    if (out.length >= max) break;
    push(nextAt(nowMs, a.h, a.m, minLead), "rhythm");
  }

  return out.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()).slice(0, max);
}
