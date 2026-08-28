// Stop condition — ground truth that is not an ETA.
// One-tap attributes first. Photos, lighting, walkability and wheelchair
// one-tap stay later. Unknown stays silent. Seed is the curated Nicosia
// hubs; riders overwrite once two devices agree.

export const CONSENSUS_MIN = 2;
export const REPORT_RATE_LIMIT_SEC = 60;

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

/** First questions on the stop. One at a time, yes/no. */
export const ASK_FIRST: StopAttribute[] = ["has_shelter", "has_seating"];

export type StopReport = {
  stopId: string;
  deviceId: string;
  attribute: StopAttribute;
  value: string;
  reportedAt: number;
};

export type StopConsensus = {
  stopId: string;
  attribute: StopAttribute;
  value: string;
  n: number;
  source: "seed" | "riders";
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

export function pickStopConsensus(
  reports: StopReport[],
  previous: { value: string; source: "seed" | "riders" } | null,
): { value: string; n: number; source: "seed" | "riders" } | null {
  const latest = lastReportPerDevice(reports);
  const n = latest.length;
  const seed = previous?.source === "seed" ? previous.value : null;
  if (n < CONSENSUS_MIN) {
    if (seed) return { value: seed, n, source: "seed" };
    return previous ? { value: previous.value, n, source: previous.source } : null;
  }
  const counts = new Map<string, number>();
  for (const r of latest) counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
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
    if (seed) return { value: seed, n, source: "seed" };
    return previous ? { value: previous.value, n, source: previous.source } : null;
  }
  return { value: best, n, source: "riders" };
}

export function nextStopAsk(rows: StopConsensus[]): StopAttribute | null {
  for (const attr of ASK_FIRST) {
    if (!rows.some((r) => r.attribute === attr)) return attr;
  }
  return null;
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
    },
    {
      stopId: a.stopId,
      attribute: "has_seating",
      value: a.seating ? "yes" : "no",
      n: 0,
      source: "seed",
    },
  ];
  if (a.stepFree) {
    rows.push({
      stopId: a.stopId,
      attribute: "wheelchair_access",
      value: "yes",
      n: 0,
      source: "seed",
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
  return null;
}

export function stopConditionAsk(attr: StopAttribute): string | null {
  if (attr === "has_shelter") return "Shelter here?";
  if (attr === "has_seating") return "A seat here?";
  return null;
}
