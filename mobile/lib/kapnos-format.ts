// Pure formatting helpers for the Kapnos airport-coach surfaces.
//
// Kept out of the component so the wording riders see (a walk of "1.2 km"
// rather than "1240 m", a route rendered "Larnaca → Nicosia") is unit-tested
// rather than eyeballed.

/** Walks longer than this are not a reasonable connection to the coach stop. */
export const WALKABLE_M = 1_200;

/** Metres under ~1 km, otherwise one decimal of a kilometre. */
export function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** "2026-08-23 14:05:00" -> "14:05". Returns "" for an unparseable value. */
export function fmtTime(local: string): string {
  return (local.split(" ")[1] ?? "").slice(0, 5);
}

/** Seconds to whole minutes, never rounding a real leg down to zero. */
export function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

/** "LARNACA > NICOSIA" -> "Larnaca → Nicosia". */
export function prettyRoute(name: string): string {
  return name
    .split(/\s*>\s*/)
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" → ");
}

/** Drops the operator stop code prefix, e.g. "(A12) Finikoudes" -> "Finikoudes". */
export function shortStop(name: string): string {
  return name.replace(/^\([A-Z0-9]+\)\s*/i, "").trim();
}
