// Group-watch arrival logic.
//
// Turns a set of per-member ETAs into the "arriving together" headline, and
// a single member's raw state into the one line a rider reads under their
// name. Pure so the wording — the part people actually judge us on — is
// unit-tested rather than tangled in JSX.

import { GROUP_STALE_MS } from "./group-format";

/** ETAs within this many minutes count as "arriving together". */
export const CONVERGE_TOGETHER_MIN = 3;

export type ConvergeSummary = {
  first: number;
  last: number;
  spread: number;
  allTogether: boolean;
  headline: string;
  detail: string;
};

/**
 * Summarise when the group lands. Returns null when nobody has an ETA yet,
 * which the UI reads as "show nothing rather than an empty card".
 */
export function summariseConverge(
  etaMinutes: readonly (number | null | undefined)[],
): ConvergeSummary | null {
  const etas = etaMinutes.filter((e): e is number => typeof e === "number" && Number.isFinite(e));
  if (etas.length === 0) return null;
  const first = Math.min(...etas);
  const last = Math.max(...etas);
  const spread = last - first;
  const allTogether = spread <= CONVERGE_TOGETHER_MIN;

  const headline = allTogether
    ? first <= 0
      ? "Everyone's here."
      : `Everyone in ~${first} min.`
    : `First in ${first} min · last in ${last} min`;

  const detail = allTogether
    ? spread === 0
      ? "Same minute across the group, perfect meet-up window."
      : `Spread of ${spread} min, you'll all land inside a coffee's wait.`
    : `${spread} min gap. The earliest can grab a table while the rest catch up.`;

  return { first, last, spread, allTogether, headline, detail };
}

export type MemberStatusInput = {
  /** Row status; anything other than "active" reads as having left. */
  status: string;
  etaMinutes?: number | null;
  /** Whether we've ever had a position fix for this member. */
  hasFix: boolean;
  lastUpdated?: string | null;
  now?: number;
  staleMs?: number;
};

export type MemberStatusLine = {
  /** Primary phrase: "12 min away", "En route", "Left the group". */
  primary: string;
  /** Trailing freshness phrase, or null when there's nothing to say. */
  freshness: string | null;
  stale: boolean;
  left: boolean;
};

/** The single status line shown under a member's name. */
export function memberStatusLine(input: MemberStatusInput): MemberStatusLine {
  const now = input.now ?? Date.now();
  const staleMs = input.staleMs ?? GROUP_STALE_MS;
  const left = input.status !== "active";

  const ageMs = input.lastUpdated ? now - new Date(input.lastUpdated).getTime() : null;
  const validAge = ageMs != null && Number.isFinite(ageMs) ? Math.max(0, ageMs) : null;
  const stale = !left && validAge != null && validAge > staleMs;

  if (left) return { primary: "Left the group", freshness: null, stale: false, left: true };

  const primary =
    input.etaMinutes != null && Number.isFinite(input.etaMinutes)
      ? input.etaMinutes <= 0
        ? "Arriving now"
        : `${Math.round(input.etaMinutes)} min away`
      : input.hasFix
        ? "En route"
        : "Not yet moving";

  let freshness: string | null = null;
  if (validAge != null) {
    if (stale) freshness = "reconnecting";
    else {
      const sec = Math.round(validAge / 1000);
      freshness = sec < 60 ? `updated ${sec}s ago` : `updated ${Math.round(sec / 60)}m ago`;
    }
  }

  return { primary, freshness, stale, left: false };
}
