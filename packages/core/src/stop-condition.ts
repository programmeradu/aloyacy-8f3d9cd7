// Stop condition — ground truth that is not an ETA.
// One-tap attributes first. Photo is the last ask (stop-photo.ts).
// Routing filters stay later. Unknown stays silent. Seed is the curated
// Nicosia hubs; riders overwrite once two devices agree.

export const CONSENSUS_MIN = 2;
export const REPORT_RATE_LIMIT_SEC = 60;
/** A shelter can be removed. Older than this, a rider report is not evidence. */
export const CONSENSUS_TTL_DAYS = 90;
/** A photo from that phone is two votes. Two phones still required. */
export const PHOTO_REPORT_WEIGHT = 2;

export const STOP_ATTRIBUTES = [
  "has_shelter",
  "has_sign",
  "has_timetable",
  "has_seating",
  "lighting",
  "reachable_on_foot",
  "wheelchair_access",
  "stop_is_ambiguous",
] as const;

export type StopAttribute = (typeof STOP_ATTRIBUTES)[number];

export const STOP_ATTRIBUTE_VALUES = {
  has_shelter: ["yes", "no"],
  has_sign: ["yes", "no", "wrong"],
  has_timetable: ["yes", "no", "wrong"],
  has_seating: ["yes", "no"],
  lighting: ["good", "poor", "none"],
  reachable_on_foot: ["yes", "no_crossing", "no_sidewalk"],
  wheelchair_access: ["yes", "partial", "no"],
  stop_is_ambiguous: ["yes", "no"],
} as const satisfies Record<StopAttribute, readonly string[]>;

/** First questions on the stop. One at a time. */
export const ASK_FIRST: StopAttribute[] = [
  "has_shelter",
  "has_seating",
  "reachable_on_foot",
  "lighting",
  "wheelchair_access",
  "has_sign",
  "has_timetable",
  "stop_is_ambiguous",
];

export type StopReport = {
  stopId: string;
  deviceId: string;
  attribute: StopAttribute;
  value: string;
  reportedAt: number;
  /** 1 for a tap. PHOTO_REPORT_WEIGHT when that phone also sent a photo. */
  weight?: number;
};

export type StopConsensus = {
  stopId: string;
  attribute: StopAttribute;
  value: string;
  n: number;
  source: "seed" | "riders";
  /** Latest fresh rider report. Null on seed, or when none remain. */
  lastAt: number | null;
};

export function isStopAttribute(value: string): value is StopAttribute {
  return (STOP_ATTRIBUTES as readonly string[]).includes(value);
}

export function isStopAttributeValue(attribute: StopAttribute, value: string): boolean {
  return (STOP_ATTRIBUTE_VALUES[attribute] as readonly string[]).includes(value);
}

/** Last report per device. History stays; consensus uses the latest. */
export function lastReportPerDevice(reports: StopReport[]): StopReport[] {
  const byDevice = new Map<string, StopReport>();
  const sorted = [...reports].sort((a, b) => a.reportedAt - b.reportedAt);
  for (const r of sorted) byDevice.set(r.deviceId, r);
  return [...byDevice.values()];
}

export function freshReports(reports: StopReport[], nowMs: number): StopReport[] {
  const cutoff = nowMs - CONSENSUS_TTL_DAYS * 86_400_000;
  return reports.filter((r) => r.reportedAt >= cutoff);
}

export function daysSince(lastAt: number, nowMs: number): number {
  if (!Number.isFinite(lastAt) || lastAt > nowMs) return 0;
  return Math.max(0, Math.floor((nowMs - lastAt) / 86_400_000));
}

export function riderConfirmLine(n: number, days: number): string {
  if (days <= 0) return `Confirmed by ${n} riders`;
  return `Confirmed by ${n} riders, last ${days} day${days === 1 ? "" : "s"} ago`;
}

export function reportWeight(r: StopReport): number {
  return r.weight && r.weight > 0 ? r.weight : 1;
}

/** A photo on this stop from that phone doubles the tap. Does not invent an attribute. */
export function weighReports(reports: StopReport[], photoDevices: Set<string>): StopReport[] {
  if (photoDevices.size === 0) return reports;
  return reports.map((r) =>
    photoDevices.has(r.deviceId) ? { ...r, weight: PHOTO_REPORT_WEIGHT } : r,
  );
}

export function pickStopConsensus(
  reports: StopReport[],
  previous: { value: string; source: "seed" | "riders" } | null,
  nowMs = 0,
): { value: string; n: number; source: "seed" | "riders"; lastAt: number | null } | null {
  const latest = lastReportPerDevice(freshReports(reports, nowMs || Date.now()));
  const n = latest.length;
  const lastAt = n > 0 ? Math.max(...latest.map((r) => r.reportedAt)) : null;
  const seed = previous?.source === "seed" ? previous.value : null;
  if (n < CONSENSUS_MIN) {
    if (seed) return { value: seed, n, source: "seed", lastAt };
    return null;
  }
  const counts = new Map<string, number>();
  for (const r of latest) counts.set(r.value, (counts.get(r.value) ?? 0) + reportWeight(r));
  let best: string | null = null;
  let bestN = 0;
  let tied = false;
  for (const [value, count] of counts) {
    if (count > bestN) {
      best = value;
      bestN = count;
      tied = false;
    } else if (count === bestN) {
      tied = true;
    }
  }
  if (!best || tied) {
    if (seed) return { value: seed, n, source: "seed", lastAt };
    return previous ? { value: previous.value, n, source: previous.source, lastAt } : null;
  }
  return { value: best, n, source: "riders", lastAt };
}

export function nextStopAsk(rows: StopConsensus[]): StopAttribute | null {
  for (const attr of ASK_FIRST) {
    if (!rows.some((r) => r.attribute === attr)) return attr;
  }
  return null;
}

/** Allowed values for the current ask — same set the API accepts. */
export function stopAskChoices(attr: StopAttribute): readonly string[] | null {
  if (!ASK_FIRST.includes(attr)) return null;
  return STOP_ATTRIBUTE_VALUES[attr];
}

export type SeedAmenity = {
  stopId: string;
  shelter: boolean;
  seating: boolean;
  stepFree: boolean;
};

/** Same eight hubs as src/data/stop-amenities.ts. Shade is not a D1 field. */
export const STOP_CONDITION_SEED: SeedAmenity[] = [
  { stopId: "1009", shelter: true, seating: true, stepFree: true },
  { stopId: "1001", shelter: true, seating: true, stepFree: true },
  { stopId: "2030", shelter: true, seating: true, stepFree: true },
  { stopId: "3050", shelter: true, seating: true, stepFree: true },
  { stopId: "2050", shelter: true, seating: true, stepFree: true },
  { stopId: "intercity-larnaca-airport", shelter: true, seating: true, stepFree: true },
  { stopId: "intercity-paphos", shelter: true, seating: true, stepFree: true },
  { stopId: "intercity-limassol-oldport", shelter: true, seating: true, stepFree: true },
];

export function seedConsensus(a: SeedAmenity): StopConsensus[] {
  const rows: StopConsensus[] = [
    {
      stopId: a.stopId,
      attribute: "has_shelter",
      value: a.shelter ? "yes" : "no",
      n: 0,
      source: "seed",
      lastAt: null,
    },
    {
      stopId: a.stopId,
      attribute: "has_seating",
      value: a.seating ? "yes" : "no",
      n: 0,
      source: "seed",
      lastAt: null,
    },
  ];
  if (a.stepFree) {
    rows.push({
      stopId: a.stopId,
      attribute: "wheelchair_access",
      value: "yes",
      n: 0,
      source: "seed",
      lastAt: null,
    });
  }
  return rows;
}

export function stopConditionChip(attr: StopAttribute, value: string): string | null {
  if (attr === "has_shelter" && value === "yes") return "Shelter";
  if (attr === "has_shelter" && value === "no") return "No shelter";
  if (attr === "has_seating" && value === "yes") return "Seating";
  if (attr === "has_seating" && value === "no") return "No seating";
  if (attr === "wheelchair_access" && value === "yes") return "Step-free";
  if (attr === "wheelchair_access" && value === "partial") return "Partial access";
  if (attr === "wheelchair_access" && value === "no") return "Not step-free";
  if (attr === "reachable_on_foot" && value === "yes") return "On foot";
  if (attr === "reachable_on_foot" && value === "no_crossing") return "No crossing";
  if (attr === "reachable_on_foot" && value === "no_sidewalk") return "No sidewalk";
  if (attr === "lighting" && value === "good") return "Lit";
  if (attr === "lighting" && value === "poor") return "Poor light";
  if (attr === "lighting" && value === "none") return "Unlit";
  if (attr === "has_sign" && value === "yes") return "Sign";
  if (attr === "has_sign" && value === "no") return "No sign";
  if (attr === "has_sign" && value === "wrong") return "Wrong sign";
  if (attr === "has_timetable" && value === "yes") return "Timetable";
  if (attr === "has_timetable" && value === "no") return "No timetable";
  if (attr === "has_timetable" && value === "wrong") return "Wrong timetable";
  if (attr === "stop_is_ambiguous" && value === "yes") return "Two poles";
  return null;
}

export function stopConditionAsk(attr: StopAttribute): string | null {
  if (attr === "has_shelter") return "Shelter here?";
  if (attr === "has_seating") return "A seat here?";
  if (attr === "reachable_on_foot") return "Walk here?";
  if (attr === "lighting") return "Light here?";
  if (attr === "wheelchair_access") return "Step-free here?";
  if (attr === "has_sign") return "A sign here?";
  if (attr === "has_timetable") return "A timetable here?";
  if (attr === "stop_is_ambiguous") return "Two poles here?";
  return null;
}

export function stopAskChoiceLabel(value: string): string | null {
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "no_crossing") return "No crossing";
  if (value === "no_sidewalk") return "No sidewalk";
  if (value === "good") return "Good";
  if (value === "poor") return "Poor";
  if (value === "none") return "None";
  if (value === "partial") return "Partial";
  if (value === "wrong") return "Wrong";
  return null;
}
