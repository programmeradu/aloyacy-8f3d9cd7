// Trust Layer — shared freshness classifier.
//
// Every ETA-rendering surface (StopCard, stop detail, JourneyHUD,
// MultiLegCompanion, Pulse, Commute card) reads from this one module so
// the rider sees a consistent story: when one screen says "ghost",
// none of the others claim "live".
//
// Tiers (most → least trustworthy):
//   live              fresh feed ping (< FRESH) and near the stop
//   rider-confirmed   a rider sighting upgraded a stale feed (Wave 1.1)
//   predicted         we have a vehicle but ping is FRESH..GHOST old
//                     or the bus is far away → ETA still useful, but soft
//   ghost             active trip with no fresh vehicle for ≥ GHOST
//                     → DO NOT claim live; fall back to schedule
//   scheduled         no vehicle at all → operator timetable only
//
// Thresholds are agency-aware: Intercity feed pings sparser, so what
// looks "ghost" for an urban bus is "predicted" for IC.

export type FreshnessTier = "live" | "rider-confirmed" | "predicted" | "ghost" | "scheduled";

export type FreshnessConfidence = "high" | "medium" | "low";

export type Agency = "urban" | "IC" | string | undefined;

export type FreshnessInput = {
  /** Has any vehicle row for this trip in the feed (rider or upstream). */
  hasVehicle: boolean;
  /** Age in seconds of the last vehicle ping. Infinity if no vehicle. */
  pingAgeSec: number;
  /** Was the latest ping a rider-confirmed sighting? (Wave 1.1) */
  riderConfirmed?: boolean;
  /** Distinct devices that confirmed this trip. Absent → one (fail closed). */
  riderSources?: number;
  /** How many GTFS stops separate the bus from the rider's stop. */
  stopsAway?: number;
  /** "IC" relaxes thresholds. */
  agency?: Agency;
  /** Backing sample count behind the speed/dwell model. */
  modelSamples?: number;
  /** A4: data-derived threshold overrides from ping-gap percentiles. */
  thresholdOverrides?: { fresh?: number; ghost?: number; near?: number };
};

export type FreshnessToken =
  | "live"
  | "rider"
  | "one rider"
  | "predicted"
  | "stale ping"
  | "no gps"
  | "scheduled";

export type FreshnessResult = {
  tier: FreshnessTier;
  confidence: FreshnessConfidence;
  /** Short uppercase chip text. Already localised? No — it is a
   *  stable English token; surfaces map it through i18n. */
  token: FreshnessToken;
};

const URBAN = { fresh: 60, ghost: 180, near: 5 } as const;
const INTERCITY = { fresh: 90, ghost: 300, near: 8 } as const;

/** Two distinct devices before we drop the "one rider" caveat. */
export const CORROBORATION_MIN = 2;

export function isSingleRiderSource(sources: number | undefined): boolean {
  return (sources ?? 1) < CORROBORATION_MIN;
}

export function thresholdsFor(
  agency: Agency,
  overrides?: { fresh?: number; ghost?: number; near?: number },
) {
  const base = agency === "IC" ? INTERCITY : URBAN;
  if (!overrides) return base;
  return {
    fresh: overrides.fresh ?? base.fresh,
    ghost: overrides.ghost ?? base.ghost,
    near: overrides.near ?? base.near,
  } as const;
}

export function classifyFreshness(input: FreshnessInput): FreshnessResult {
  const T = thresholdsFor(input.agency, input.thresholdOverrides);
  const samples = input.modelSamples ?? 0;
  const stops = input.stopsAway ?? 99;

  // No vehicle row at all → scheduled.
  if (!input.hasVehicle || !Number.isFinite(input.pingAgeSec)) {
    return { tier: "scheduled", confidence: "low", token: "scheduled" };
  }

  const age = Math.max(0, input.pingAgeSec);

  // Rider-confirmed within the trust window wins over "stale ping" /
  // "ghost" — one rider physically seeing the bus is stronger evidence
  // than the absence of a fresh GTFS-RT row. A lone reporter stays
  // rider-confirmed but is named as one rider, low confidence. Two
  // devices agree → full rider-confirmed. Missing count fails closed.
  if (input.riderConfirmed && age < T.ghost) {
    if (isSingleRiderSource(input.riderSources)) {
      return { tier: "rider-confirmed", confidence: "low", token: "one rider" };
    }
    const conf: FreshnessConfidence = age < T.fresh ? "high" : "medium";
    return { tier: "rider-confirmed", confidence: conf, token: "rider" };
  }

  // Stale ≥ ghost threshold → demote to ghost regardless of model quality.
  if (age >= T.ghost) {
    return { tier: "ghost", confidence: "low", token: "no gps" };
  }

  // Fresh ping + close to the rider → live.
  if (age < T.fresh && stops <= T.near) {
    // Sample coverage has to matter here: a fresh, nearby ping backed by a
    // thin speed/dwell model is not the same claim as one backed by 10+
    // observed segments, and "low" is what lets surfaces soften the band.
    const confidence: FreshnessConfidence =
      samples >= 10 ? "high" : samples >= 4 ? "medium" : "low";
    return { tier: "live", confidence, token: "live" };
  }

  // Fresh but far, or aging ping → predicted.
  const token = age >= T.fresh ? "stale ping" : "predicted";
  const confidence: FreshnessConfidence = samples >= 10 && age < T.fresh ? "medium" : "low";
  return { tier: "predicted", confidence, token };
}

/** Tailwind text colour for a tier — used by chips and headline numerals. */
export function tierAccent(tier: FreshnessTier): string {
  switch (tier) {
    case "live":
    case "rider-confirmed":
      return "text-aegean-deep";
    case "predicted":
      return "text-ochre";
    case "ghost":
      return "text-ink-soft/60";
    case "scheduled":
    default:
      return "text-ink-soft";
  }
}

/** Tailwind ring colour for confidence dot. */
export function confidenceDot(c: FreshnessConfidence): string {
  switch (c) {
    case "high":
      return "bg-aegean-deep";
    case "medium":
      return "bg-ochre";
    case "low":
    default:
      return "bg-ink-soft/40";
  }
}
