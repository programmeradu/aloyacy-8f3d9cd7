// Pure maths and copy selection behind the "How the network is moving" card.
//
// The route used to compute bar heights, pick the summary sentence and decide
// whether there is anything worth drawing inline in JSX. Pulled out here so the
// same rules can be asserted in tests and reused by the native app, which
// renders the identical strip with react-native-svg.

/** One hour of delay observations, as returned by pulse_hour_strip(). */
export type ActivityBucket = { sampleCount: number };

/** Shape of the summary line under the proportion bar. */
export type FlowSummary =
  { kind: "late"; minutes: number } | { kind: "early"; minutes: number } | { kind: "onTime" };

/**
 * Which sentence to show for the median delay. Anything inside ±60s reads as
 * on-time — riders do not experience a 40-second median as lateness, and
 * rounding it to "1 min late" would overstate what we actually measured.
 */
export function flowSummary(medianSec: number): FlowSummary {
  const minutes = Math.round(medianSec / 60);
  if (minutes >= 1) return { kind: "late", minutes };
  if (minutes <= -1) return { kind: "early", minutes: Math.abs(minutes) };
  return { kind: "onTime" };
}

/** Rendering geometry for the 24-hour activity comb. */
export type CombBar = {
  hour: number;
  /** Pixel height of the bar. */
  height: number;
  /** True for the hour the rider is currently in. */
  isNow: boolean;
  /** True when no observations landed in this hour. */
  isEmpty: boolean;
};

export const COMB_MIN_PX = 2;
export const COMB_BASE_PX = 4;
export const COMB_RANGE_PX = 22;

/**
 * Turn hourly sample counts into bar geometry.
 *
 * Empty hours keep a hairline so the strip still reads as a 24-hour axis rather
 * than collapsing into a few floating bars; busy hours scale against the day's
 * own peak so a quiet Sunday is legible on the same chart as a Monday rush.
 */
export function combBars(buckets: ActivityBucket[], nowHour: number): CombBar[] {
  const peak = Math.max(1, ...buckets.map((b) => b.sampleCount));
  return buckets.map((b, hour) => {
    const isEmpty = b.sampleCount <= 0;
    return {
      hour,
      isEmpty,
      isNow: hour === nowHour,
      height: isEmpty
        ? COMB_MIN_PX
        : COMB_BASE_PX + Math.round((Math.min(b.sampleCount, peak) / peak) * COMB_RANGE_PX),
    };
  });
}

/**
 * The comb is only honest when at least one hour carries data — an all-zero
 * strip looks like an outage rather than a quiet night, so we hide it.
 */
export function hasActivity(buckets: ActivityBucket[]): boolean {
  return buckets.length > 0 && buckets.some((b) => b.sampleCount > 0);
}

/** Total observations recorded across the strip. */
export function totalSamples(buckets: ActivityBucket[]): number {
  return buckets.reduce((sum, b) => sum + Math.max(0, b.sampleCount), 0);
}

/**
 * Proportion-bar widths, clamped and normalised so rounding in the backend can
 * never push the three segments past 100% and wrap the bar.
 */
export function flowSegments(latePct: number, onTimePct: number, earlyPct: number) {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const late = safe(latePct);
  const onTime = safe(onTimePct);
  const early = safe(earlyPct);
  const total = late + onTime + early;
  if (total <= 0) return { late: 0, onTime: 0, early: 0 };
  const scale = 100 / total;
  return { late: late * scale, onTime: onTime * scale, early: early * scale };
}
