// Unified UX copy for journey/ETA strings. Single source of truth so the HUD,
// stop cards, multi-leg companion, and sheets never disagree on wording.
//
// Rule: never inline `${Math.round(s/60)} min` in a component — call `fmtEta`.

import type { JourneyPhase } from "./journey-phase";

/** Format a seconds value as "N min" (floored at 0, never negative). */
export function fmtEta(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  return `${m} min`;
}

/** Format a minutes value (already in minutes) as "N min". */
export function fmtEtaMin(min: number): string {
  return `${Math.max(0, Math.round(min))} min`;
}

/** Format a min/max minute band as "8–12 min". Collapses to single when equal. */
export function fmtBand(lowerMin: number, upperMin: number): string {
  const lo = Math.max(0, Math.round(lowerMin));
  const hi = Math.max(lo, Math.round(upperMin));
  if (lo === hi) return `${lo} min`;
  return `${lo}\u2013${hi} min`; // en-dash
}

/** Format an absolute Unix time (seconds) as local "HH:MM". */
export function fmtClock(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type EtaStatus = "live" | "predicted" | "scheduled" | "stale";

/** One-word freshness label for an ETA. */
export const ETA_STATUS_LABEL: Record<EtaStatus, string> = {
  live: "Live",
  predicted: "Predicted",
  scheduled: "Scheduled",
  stale: "Stale",
};

/** Headline copy per phase. Short — used in HUD top line. */
export const PHASE_COPY: Record<JourneyPhase, string> = {
  idle: "Ready when you are",
  // walking
  "walking-to-stop": "Walk to stop",
  "walking-to-board": "Walk to stop",
  "walking-to-transfer": "Walk to transfer",
  "walking-to-dest": "Final stretch",
  "walking-to-destination": "Final stretch",
  // waiting
  "at-stop": "At the stop",
  "waiting-to-board": "Waiting to board",
  "waiting-for-connection": "Waiting for connection",
  "hurry-soft": "Pick up the pace",
  "hurry-urgent": "Hurry \u2014 bus is close",
  // bus
  boarding: "Board now",
  "on-bus": "On the bus",
  riding: "On the bus",
  "alight-soon": "Get off soon",
  // failure
  "missed-bus": "Missed the bus",
  "missed-connection": "Missed the connection",
  arrived: "You\u2019ve arrived",
};
