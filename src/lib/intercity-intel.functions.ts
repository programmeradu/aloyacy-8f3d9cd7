// Wave 3 — Cross-island intercity intelligence.
//
// Intercity routes (agency = "IC") are the long-distance lifelines of Cyprus:
// Nicosia↔Limassol, Nicosia↔Paphos, Nicosia↔Famagusta corridors. They share
// two properties that make pattern learning especially valuable:
//   1. Sparse frequency — a missed bus can mean a 60-minute wait.
//   2. Heavy weekly seasonality — Friday-evening getaways and Sunday-evening
//      returns regularly run minutes late, while early-morning runs are
//      typically on time.
//
// This module turns the (route_id, stop_id, hour_of_day, day_of_week) bucket
// distribution in `delay_stats` into three rider-facing answers:
//   - **Weekend split**: how does Sat/Sun delay compare to weekday delay?
//   - **Best window**: which dow×hour bucket is most reliable?
//   - **Anomalies**: which dow×hour buckets run materially worse than the
//     route baseline? (z-score against route mean, weighted by samples)
//
// All thresholds are calibrated so that low-sample routes return `unknown`
// instead of fake confidence. The rule of thumb across the trust roadmap
// applies: if we don't know, we say so.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Thresholds ───────────────────────────────────────────────────────────
const MIN_BUCKET_SAMPLES = 5;        // ignore buckets below this
const MIN_TOTAL_SAMPLES_RATED = 60;  // route is "rated" only above this
const ANOMALY_DELTA_SEC = 90;        // bucket must exceed baseline by 90s
const ANOMALY_Z_MIN = 1.0;           // and clear 1.0σ against the route spread
const MAX_ANOMALIES = 3;             // surface at most 3 callouts
const WEEKEND_DAYS = new Set([0, 6]); // Postgres dow: 0=Sun, 6=Sat
const STDDEV_FLOOR_SEC = 60;         // IC feed noisier than urban; 60s floor

// ─── Types ────────────────────────────────────────────────────────────────
export type IntercityInsightTier = "rated" | "learning" | "unknown";

export type IntercityWindow = {
  /** Postgres dow: 0=Sunday … 6=Saturday */
  dayOfWeek: number;
  /** 0-23 local hour */
  hourOfDay: number;
  /** Mean delay in seconds for this bucket (weighted across stops). */
  meanDelaySec: number;
  /** Sample count backing the bucket. */
  sampleCount: number;
};

export type IntercityAnomaly = IntercityWindow & {
  /** How many seconds slower than the route baseline this bucket is. */
  deltaFromBaselineSec: number;
};

export type IntercityInsights = {
  routeId: string;
  tier: IntercityInsightTier;
  /** Weighted mean delay across every bucket. */
  baselineMeanDelaySec: number;
  /** Total weighted samples. */
  sampleCount: number;
  /** Weekday (Mon–Fri) weighted mean delay. */
  weekdayMeanDelaySec: number | null;
  /** Weekend (Sat–Sun) weighted mean delay. */
  weekendMeanDelaySec: number | null;
  /** Single most reliable (dow, hour) bucket, when known. */
  bestWindow: IntercityWindow | null;
  /** Single worst (dow, hour) bucket above baseline, when known. */
  worstWindow: IntercityWindow | null;
  /** Up to MAX_ANOMALIES dow×hour callouts that consistently run late. */
  anomalies: IntercityAnomaly[];
};

// ─── Implementation ───────────────────────────────────────────────────────

type BucketAgg = {
  dow: number;
  hour: number;
  sumDelay: number;   // Σ (mean_delay_sec × sample_count)
  samples: number;
};

function bucketKey(dow: number, hour: number) {
  return `${dow}:${hour}`;
}

function weightedMean(
  rows: { mean: number; n: number }[],
): number | null {
  let s = 0;
  let n = 0;
  for (const r of rows) {
    s += r.mean * r.n;
    n += r.n;
  }
  return n > 0 ? s / n : null;
}

export const getIntercityInsights = createServerFn({ method: "GET" })
  .inputValidator((input: { routeId: string }) =>
    z.object({ routeId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<IntercityInsights> => {
    const empty: IntercityInsights = {
      routeId: data.routeId,
      tier: "unknown",
      baselineMeanDelaySec: 0,
      sampleCount: 0,
      weekdayMeanDelaySec: null,
      weekendMeanDelaySec: null,
      bestWindow: null,
      worstWindow: null,
      anomalies: [],
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("delay_stats")
      .select("hour_of_day, day_of_week, mean_delay_sec, sample_count")
      .eq("route_id", data.routeId)
      .gte("sample_count", MIN_BUCKET_SAMPLES);

    if (error || !rows || rows.length === 0) return empty;

    // Aggregate up to (dow, hour) — collapsing every stop into one bucket.
    const byBucket = new Map<string, BucketAgg>();
    let totalSumDelay = 0;
    let totalSamples = 0;
    for (const r of rows) {
      const dow = Number(r.day_of_week);
      const hour = Number(r.hour_of_day);
      const n = Number(r.sample_count) || 0;
      if (n < MIN_BUCKET_SAMPLES) continue;
      const mean = Number(r.mean_delay_sec) || 0;
      const k = bucketKey(dow, hour);
      const slot = byBucket.get(k) ?? { dow, hour, sumDelay: 0, samples: 0 };
      slot.sumDelay += mean * n;
      slot.samples += n;
      byBucket.set(k, slot);
      totalSumDelay += mean * n;
      totalSamples += n;
    }

    if (totalSamples === 0) return empty;

    const baselineMeanDelaySec = totalSumDelay / totalSamples;

    // Per-bucket mean + variance against baseline (sample-weighted).
    const buckets: (IntercityWindow & { delta: number })[] = [];
    let sumWeightedSqDev = 0;
    for (const s of byBucket.values()) {
      const mean = s.sumDelay / s.samples;
      buckets.push({
        dayOfWeek: s.dow,
        hourOfDay: s.hour,
        meanDelaySec: mean,
        sampleCount: s.samples,
        delta: mean - baselineMeanDelaySec,
      });
      sumWeightedSqDev += s.samples * (mean - baselineMeanDelaySec) ** 2;
    }
    const variance = sumWeightedSqDev / totalSamples;
    const stddev = Math.max(Math.sqrt(variance), STDDEV_FLOOR_SEC);

    // Weekend/weekday split.
    const weekday = weightedMean(
      buckets
        .filter((b) => !WEEKEND_DAYS.has(b.dayOfWeek))
        .map((b) => ({ mean: b.meanDelaySec, n: b.sampleCount })),
    );
    const weekend = weightedMean(
      buckets
        .filter((b) => WEEKEND_DAYS.has(b.dayOfWeek))
        .map((b) => ({ mean: b.meanDelaySec, n: b.sampleCount })),
    );

    // Best window = lowest |meanDelay| with at least MIN_BUCKET_SAMPLES.
    // Worst window = highest meanDelay (positive lateness only).
    let best: IntercityWindow | null = null;
    let worst: IntercityWindow | null = null;
    for (const b of buckets) {
      const w: IntercityWindow = {
        dayOfWeek: b.dayOfWeek,
        hourOfDay: b.hourOfDay,
        meanDelaySec: b.meanDelaySec,
        sampleCount: b.sampleCount,
      };
      if (!best || Math.abs(b.meanDelaySec) < Math.abs(best.meanDelaySec)) {
        best = w;
      }
      if (b.meanDelaySec > 0 && (!worst || b.meanDelaySec > worst.meanDelaySec)) {
        worst = w;
      }
    }

    // Anomalies — buckets meaningfully above baseline by both absolute (sec)
    // and relative (z-score) measures, ranked by delta, capped to MAX.
    const anomalies: IntercityAnomaly[] = buckets
      .filter((b) => b.delta >= ANOMALY_DELTA_SEC)
      .filter((b) => b.delta / stddev >= ANOMALY_Z_MIN)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, MAX_ANOMALIES)
      .map<IntercityAnomaly>((b) => ({
        dayOfWeek: b.dayOfWeek,
        hourOfDay: b.hourOfDay,
        meanDelaySec: b.meanDelaySec,
        sampleCount: b.sampleCount,
        deltaFromBaselineSec: b.delta,
      }));

    const tier: IntercityInsightTier =
      totalSamples >= MIN_TOTAL_SAMPLES_RATED ? "rated" : "learning";

    return {
      routeId: data.routeId,
      tier,
      baselineMeanDelaySec: Math.round(baselineMeanDelaySec),
      sampleCount: totalSamples,
      weekdayMeanDelaySec: weekday === null ? null : Math.round(weekday),
      weekendMeanDelaySec: weekend === null ? null : Math.round(weekend),
      bestWindow: best && {
        ...best,
        meanDelaySec: Math.round(best.meanDelaySec),
      },
      worstWindow: worst && {
        ...worst,
        meanDelaySec: Math.round(worst.meanDelaySec),
      },
      anomalies: anomalies.map((a) => ({
        ...a,
        meanDelaySec: Math.round(a.meanDelaySec),
        deltaFromBaselineSec: Math.round(a.deltaFromBaselineSec),
      })),
    };
  });
