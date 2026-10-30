// How a group member is travelling right now, for the badge on their avatar.
// Pure and conservative: when the signal is weak the answer is null (no badge).

export type MemberMode = "walk" | "bus" | "bike" | "taxi";

export const MEMBER_MODES: readonly MemberMode[] = ["walk", "bus", "bike", "taxi"];

/** A stored or posted value, accepted only when it is a known mode. */
export function normaliseMode(v: unknown): MemberMode | null {
  return typeof v === "string" && (MEMBER_MODES as readonly string[]).includes(v)
    ? (v as MemberMode)
    : null;
}

/** Below this a moving person reads as walking. */
export const WALK_MAX_KMH = 7;
/** Above this, and not riding a bus, a person reads as in a car or taxi. */
export const CAR_MIN_KMH = 26;
/** A position this close to a live bus counts as riding it. */
export const BUS_MATCH_M = 45;

/**
 * Mode from speed and whether the position sits on a live bus.
 * Null when there is no usable speed (first fix, stale pings).
 */
export function inferMode(input: {
  speedKmh: number | null | undefined;
  nearLiveBusM?: number | null;
}): MemberMode | null {
  const v = input.speedKmh;
  if (input.nearLiveBusM != null && input.nearLiveBusM <= BUS_MATCH_M && (v == null || v >= 3))
    return "bus";
  if (v == null || !Number.isFinite(v) || v < 0) return null;
  if (v < WALK_MAX_KMH) return "walk";
  if (v < CAR_MIN_KMH) return "bike";
  return "taxi";
}

/** Speed between two fixes in km/h, or null when the gap is too short or too long to trust. */
export function speedBetween(
  a: { lat: number; lng: number; atMs: number },
  b: { lat: number; lng: number; atMs: number },
): number | null {
  const dt = (b.atMs - a.atMs) / 1000;
  if (!(dt >= 5 && dt <= 300)) return null;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h));
  return (m / dt) * 3.6;
}
