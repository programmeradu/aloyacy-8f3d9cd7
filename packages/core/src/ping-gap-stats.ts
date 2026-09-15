// Ping-gap percentile computation for self-tuning freshness thresholds (A4).
//
// The freshness classifier in `freshness.ts` uses hardcoded thresholds:
//   URBAN   = { fresh: 60,  ghost: 180 }
//   INTERCITY = { fresh: 90, ghost: 300 }
//
// These were educated guesses. A4 replaces them with data-derived values:
//   fresh = p75 of observed inter-ping gaps (per agency, ideally per route)
//   ghost = p95 of observed inter-ping gaps
//
// Pure module: no I/O, no Supabase, no side effects. Caller provides the
// raw gap observations; this module returns the thresholds.

/** Computed thresholds from observed ping gaps. */
export type PingGapThresholds = {
  /** p75 of inter-ping gaps — the "fresh" cutoff. */
  freshSec: number;
  /** p95 of inter-ping gaps — the "ghost" cutoff. */
  ghostSec: number;
  /** Number of gap observations used. */
  sampleCount: number;
  /** Agency these thresholds apply to. */
  agency: string;
  /** Route ID if per-route, undefined if agency-wide. */
  routeId?: string;
};

/** Minimum gap observations before we trust the percentiles. */
export const MIN_GAP_SAMPLES = 50;

/**
 * Safety clamps — prevents degenerate data (e.g. a single bus pinging
 * every 5 seconds, or a feed that updates once per hour) from producing
 * thresholds that break the classifier.
 */
const FRESH_MIN = 30;
const FRESH_MAX = 120;
const GHOST_MIN = 120;
const GHOST_MAX = 600;

/**
 * Compute p75 and p95 thresholds from an array of inter-ping gap
 * durations (in seconds).
 *
 * Uses the linear interpolation percentile method (same as NumPy default).
 * Returns `null` if `gaps.length < MIN_GAP_SAMPLES`.
 */
export function computePingGapThresholds(
  gaps: number[],
  agency: string,
  routeId?: string,
): PingGapThresholds | null {
  if (gaps.length < MIN_GAP_SAMPLES) return null;

  // Sort ascending for percentile extraction.
  // We copy to avoid mutating the caller's array.
  const sorted = Float64Array.from(gaps).sort();

  const fresh = clamp(percentile(sorted, 0.75), FRESH_MIN, FRESH_MAX);
  const ghost = clamp(percentile(sorted, 0.95), GHOST_MIN, GHOST_MAX);

  return {
    freshSec: Math.round(fresh),
    ghostSec: Math.round(ghost),
    sampleCount: sorted.length,
    agency,
    routeId,
  };
}

/**
 * Linear interpolation percentile on a pre-sorted Float64Array.
 *
 * For a percentile p ∈ [0, 1] on n sorted values:
 *   rank = p × (n − 1)
 *   lower = floor(rank), upper = ceil(rank)
 *   result = values[lower] + (rank − lower) × (values[upper] − values[lower])
 *
 * This matches NumPy's `np.percentile(arr, p*100, interpolation='linear')`.
 */
function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];

  const rank = p * (n - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];

  const frac = rank - lower;
  return sorted[lower] + frac * (sorted[upper] - sorted[lower]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
