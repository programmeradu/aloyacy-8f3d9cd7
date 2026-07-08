// Formatting for the group-watch surfaces (web + native).
//
// Pure functions only: avatar initials, ETA copy, "last seen" phrasing and
// the staleness rule that decides when a member's dot goes quiet. Shared so
// both platforms word the same state identically.

/** Default window after which a member's last ping counts as stale. */
export const GROUP_STALE_MS = 75_000;

/** Up to two initials from a display name; falls back to a neutral mark. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

/** Rider-facing ETA: "—", "Arriving", "12 min", "1 h", "1 h 20". */
export function formatEta(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes <= 0) return "Arriving";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

/** Plain-language age of a member's last known position. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "no location yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "no location yet";
  const diffSec = Math.max(0, (now - then) / 1000);
  if (diffSec < 45) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  return `${Math.round(diffSec / 3600)} h ago`;
}

/** True when a member hasn't pinged inside the stale window. */
export function isStale(
  iso: string | null | undefined,
  now: number = Date.now(),
  staleMs: number = GROUP_STALE_MS,
): boolean {
  if (!iso) return true;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return true;
  return now - then > staleMs;
}
