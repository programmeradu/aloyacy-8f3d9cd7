/**
 * Cyprus wall-clock helpers.
 *
 * Every clock the rider types or reads in Aloya is Cyprus local time — the
 * buses run on Nicosia time whether the rider's phone is set to Accra, Athens
 * or Anchorage. Reading `Date#getHours()` on the device silently reinterprets
 * "08:30" as the device's zone, which is how "arrive by 08:30" ended up being
 * watched as 11:30. So: parse and format through Asia/Nicosia, always.
 *
 * Pure and time-injectable — nothing here reads the clock itself.
 */

export const CY_TZ = "Asia/Nicosia";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type CyParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0=Sunday … 6=Saturday, in Cyprus. */
  weekday: number;
};

/** Break an instant into Cyprus wall-clock parts. */
export function cyParts(atMs: number): CyParts {
  const map: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(new Date(atMs))) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Some ICU builds render midnight as "24" under hour12:false.
    hour: hour === 24 ? 0 : hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday ?? "Sun"] ?? 0,
  };
}

/** Cyprus UTC offset in ms at a given instant (DST-aware). */
export function cyOffsetMs(atMs: number): number {
  const p = cyParts(atMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(atMs / 1000) * 1000;
}

/**
 * Turn a Cyprus wall clock into an instant. Solved iteratively so the DST
 * changeover (last Sunday of March / October) lands on the right side.
 */
export function cyWallToMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = naive - 3 * 3_600_000;
  for (let i = 0; i < 3; i++) {
    const next = naive - cyOffsetMs(guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "17:05" in Cyprus. */
export function cyClock(atMs: number): string {
  const p = cyParts(atMs);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "2026-08-23T16:00" — the shape a native datetime-local input speaks. */
export function cyInputValue(atMs: number): string {
  const p = cyParts(atMs);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Parse "2026-08-23T16:00" as Cyprus wall time. Returns null when malformed. */
export function cyInputToMs(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const ms = cyWallToMs(+m[1], +m[2], +m[3], +m[4], +m[5]);
  return Number.isFinite(ms) ? ms : null;
}

/** Midnight (00:00 Cyprus) of the day containing `atMs`. */
export function cyStartOfDayMs(atMs: number): number {
  const p = cyParts(atMs);
  return cyWallToMs(p.year, p.month, p.day, 0, 0);
}

/** Whole Cyprus calendar days between two instants (b - a). */
export function cyDayDiff(aMs: number, bMs: number): number {
  return Math.round((cyStartOfDayMs(bMs) - cyStartOfDayMs(aMs)) / 86_400_000);
}

/** True when the instant falls on a Saturday or Sunday in Cyprus. */
export function cyIsWeekend(atMs: number): boolean {
  const w = cyParts(atMs).weekday;
  return w === 0 || w === 6;
}

/** Add whole Cyprus calendar days, preserving the wall clock across DST. */
export function cyAddDays(atMs: number, days: number, hour?: number, minute?: number): number {
  const p = cyParts(atMs);
  return cyWallToMs(
    p.year,
    p.month,
    p.day + days,
    hour ?? p.hour,
    minute ?? p.minute,
  );
}
