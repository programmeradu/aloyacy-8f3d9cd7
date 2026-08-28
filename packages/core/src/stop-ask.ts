// D4 — one ask per journey, at the stop, where the answer is free.
// Condition first, then a photo, then “it drove past”. A tap closes
// the rest of this ride. Not a day of questions.

export const STOP_ASK_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export type StopAskKind = "condition" | "photo" | "skipReport";

export function shouldOpenStopAsk(lastAskAt: number | null, nowMs: number): boolean {
  if (lastAskAt == null || lastAskAt > nowMs) return true;
  return nowMs - lastAskAt >= STOP_ASK_COOLDOWN_MS;
}

export function pickStopAsk(flags: {
  condition: boolean;
  photo: boolean;
  skipReport: boolean;
}): StopAskKind | null {
  if (flags.condition) return "condition";
  if (flags.photo) return "photo";
  if (flags.skipReport) return "skipReport";
  return null;
}
