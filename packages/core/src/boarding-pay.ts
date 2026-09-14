// Published Motion fares, from 3 August 2026. Urban and intercity only.
// Pame Express and Kapnos are not these numbers — we stay quiet there.
// We do not claim the driver waits, and we do not invent exact-change rules.

import { cyParts } from "./cy-time";

export type BoardingPayKind = "urban" | "intercity";

export const BOARDING_PAY = {
  urban: {
    motionEur: 2.0,
    paperEur: 2.7,
    day: { motionEur: 2.0, paperEur: 2.7 },
    night: { motionEur: 3.5, paperEur: 4.7 },
  },
  intercity: {
    minEur: 5.0,
    maxEur: 8.0,
    cashOnly: true,
  },
} as const;

const URBAN_AGENCIES = new Set(["NPT", "LMS", "LCA", "PFO", "FAM"]);
const URBAN_FEED_IDS = new Set([2, 4, 5, 9, 10, 11]);

export function formatEur(n: number, forceDecimals = false): string {
  if (forceDecimals) return `€${n.toFixed(2)}`;
  return Number.isInteger(n) ? `€${n}` : `€${n.toFixed(2)}`;
}

/**
 * Cyprus night bus fare hours: 21:00 to 04:00 (Asia/Nicosia).
 */
export function isCyprusNight(atMs: number = Date.now()): boolean {
  const p = cyParts(atMs);
  return p.hour >= 21 || p.hour < 4;
}

export function boardingPayKind(input: {
  agency?: string;
  feedId?: number;
  short?: string;
}): BoardingPayKind | null {
  const agency = (input.agency ?? "").toUpperCase();
  if (agency === "SPC") return null;
  if (agency === "IC" || input.feedId === 6 || /^IC/i.test(input.short ?? "")) {
    return "intercity";
  }
  if (URBAN_AGENCIES.has(agency)) return "urban";
  if (input.feedId != null && URBAN_FEED_IDS.has(input.feedId)) return "urban";
  return null;
}

export function boardingPayLine(kind: BoardingPayKind, atMs?: number): string {
  if (kind === "intercity") {
    return "€5.00–€8.00 by distance, cash only.";
  }
  const night = isCyprusNight(atMs);
  const p = night ? BOARDING_PAY.urban.night : BOARDING_PAY.urban.day;
  return `Tap Motion ${formatEur(p.motionEur, true)}, or pay the driver ${formatEur(p.paperEur, true)}.`;
}

