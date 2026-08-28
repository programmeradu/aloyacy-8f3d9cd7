// Published Motion fares, from 3 August 2026. Urban and intercity only.
// Pame Express and Kapnos are not these numbers — we stay quiet there.
// We do not claim the driver waits, and we do not invent exact-change rules.

export type BoardingPayKind = "urban" | "intercity";

export const BOARDING_PAY = {
  urban: { motionEur: 1.8, paperEur: 2.4 },
  intercity: { motionEur: 6, paperEur: 8 },
} as const;

const URBAN_AGENCIES = new Set(["NPT", "LMS", "LCA", "PFO", "FAM"]);
const URBAN_FEED_IDS = new Set([2, 4, 5, 9, 10, 11]);

export function formatEur(n: number): string {
  return Number.isInteger(n) ? `€${n}` : `€${n.toFixed(2)}`;
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

export function boardingPayLine(kind: BoardingPayKind): string {
  const p = BOARDING_PAY[kind];
  return `Tap Motion ${formatEur(p.motionEur)}, or pay the driver ${formatEur(p.paperEur)}.`;
}
