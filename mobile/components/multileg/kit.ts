// Shared primitives for the native multi-leg companion: editorial kicker
// type style plus the two duration/clock formatters every sub-component uses.
// Kept separate so the companion pieces stay small and independently testable.

export const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

/** Seconds → whole minutes, never negative. */
export function fmtMin(sec: number): number {
  return Math.max(0, Math.round(sec / 60));
}

/** Unix seconds → local HH:MM, empty string for a missing timestamp. */
export function fmtClock(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
