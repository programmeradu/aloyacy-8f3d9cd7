// Per-route reliability scores derived from the learned delay_stats table.
//
// We model each (route, stop, hour-of-day, day-of-week) bucket as a normal
// distribution N(mean_delay, stddev) and estimate the probability that an
// arrival in that bucket falls within ±120s of schedule. We then weight by
// sample_count and aggregate up to the route level.
//
// On-time threshold: |delay| <= 120s (industry-standard transit definition).
// "Rated" requires >= 30 weighted samples — below that we return `unknown`
// rather than fake confidence.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ON_TIME_WINDOW_SEC = 120;
const MIN_SAMPLES_RATED = 30;

export type ReliabilityTier = "high" | "medium" | "low" | "unknown";

export type RouteReliability = {
  routeId: string;
  /** Probability-weighted on-time percentage (|delay| <= 120s). 0-100. */
  onTimePct: number;
  /** Average mean delay across all buckets, weighted by sample_count. Seconds. */
  meanDelaySec: number;
  /** Total weighted samples backing the estimate. */
  sampleCount: number;
  tier: ReliabilityTier;
};

// Abramowitz & Stegun 7.1.26 — max error ~1.5e-7. Plenty for a 0-100 %.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x: number, mean: number, std: number): number {
  if (std <= 0) {
    // Degenerate: treat as a point mass at `mean`.
    return x >= mean ? 1 : 0;
  }
  return 0.5 * (1 + erf((x - mean) / (std * Math.SQRT2)));
}

/** P(|delay| <= window | N(mean, std)). */
function probWithin(mean: number, std: number, window: number): number {
  return normalCdf(window, mean, std) - normalCdf(-window, mean, std);
}

function tierFor(onTimePct: number, sampleCount: number): ReliabilityTier {
  if (sampleCount < MIN_SAMPLES_RATED) return "unknown";
  if (onTimePct >= 80) return "high";
  if (onTimePct >= 60) return "medium";
  return "low";
}

export const getRouteReliability = createServerFn({ method: "GET" })
  .inputValidator((input: { routeIds: string[] }) =>
    z.object({ routeIds: z.array(z.string()).min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("delay_stats")
      .select("route_id, mean_delay_sec, stddev_delay_sec, sample_count")
      .in("route_id", data.routeIds)
      .gte("sample_count", 3);

    if (error || !rows) {
      return data.routeIds.map<RouteReliability>((routeId) => ({
        routeId,
        onTimePct: 0,
        meanDelaySec: 0,
        sampleCount: 0,
        tier: "unknown",
      }));
    }

    const agg = new Map<string, { sumWeightedOnTime: number; sumWeightedDelay: number; samples: number }>();
    for (const r of rows) {
      const n = Number(r.sample_count) || 0;
      if (n < 3) continue;
      const mean = Number(r.mean_delay_sec) || 0;
      const std = Number(r.stddev_delay_sec) || 0;
      // Floor stddev so a near-zero observed spread doesn't claim 100% reliability —
      // 30s reflects GPS jitter + minimum schedule resolution.
      const stdSafe = Math.max(std, 30);
      const p = probWithin(mean, stdSafe, ON_TIME_WINDOW_SEC);

      const slot = agg.get(r.route_id) ?? { sumWeightedOnTime: 0, sumWeightedDelay: 0, samples: 0 };
      slot.sumWeightedOnTime += p * n;
      slot.sumWeightedDelay += mean * n;
      slot.samples += n;
      agg.set(r.route_id, slot);
    }

    return data.routeIds.map<RouteReliability>((routeId) => {
      const slot = agg.get(routeId);
      if (!slot || slot.samples === 0) {
        return { routeId, onTimePct: 0, meanDelaySec: 0, sampleCount: 0, tier: "unknown" };
      }
      const onTimePct = Math.round((slot.sumWeightedOnTime / slot.samples) * 100);
      const meanDelaySec = Math.round(slot.sumWeightedDelay / slot.samples);
      return {
        routeId,
        onTimePct,
        meanDelaySec,
        sampleCount: slot.samples,
        tier: tierFor(onTimePct, slot.samples),
      };
    });
  });

// ────────────────────────────────────────────────────────────────────────────
// Per-stop reliability (Wave 1.4 completion)
//
// Same math as `getRouteReliability`, but filtered to the (stop, route)
// buckets a single stop actually observes. Answers the honest question
// "how reliable is this route AT THIS STOP" — always weaker than the
// route-wide average once we have enough samples, because early stops
// on a route drag the network mean up.
//
// Returns one row per requested route. Missing = unknown (never fake data).
// ────────────────────────────────────────────────────────────────────────────

export type StopReliability = RouteReliability & { stopId: string };

export const getStopReliability = createServerFn({ method: "GET" })
  .inputValidator((input: { stopId: string; routeIds: string[] }) =>
    z
      .object({
        stopId: z.string().min(1),
        routeIds: z.array(z.string()).min(1).max(30),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("delay_stats")
      .select("route_id, mean_delay_sec, stddev_delay_sec, sample_count")
      .eq("stop_id", data.stopId)
      .in("route_id", data.routeIds)
      .gte("sample_count", 3);

    if (error || !rows) {
      return data.routeIds.map<StopReliability>((routeId) => ({
        routeId,
        stopId: data.stopId,
        onTimePct: 0,
        meanDelaySec: 0,
        sampleCount: 0,
        tier: "unknown",
      }));
    }

    const agg = new Map<
      string,
      { sumWeightedOnTime: number; sumWeightedDelay: number; samples: number }
    >();
    for (const r of rows) {
      const n = Number(r.sample_count) || 0;
      if (n < 3) continue;
      const mean = Number(r.mean_delay_sec) || 0;
      const std = Number(r.stddev_delay_sec) || 0;
      const stdSafe = Math.max(std, 30);
      const p = probWithin(mean, stdSafe, ON_TIME_WINDOW_SEC);

      const slot =
        agg.get(r.route_id) ?? { sumWeightedOnTime: 0, sumWeightedDelay: 0, samples: 0 };
      slot.sumWeightedOnTime += p * n;
      slot.sumWeightedDelay += mean * n;
      slot.samples += n;
      agg.set(r.route_id, slot);
    }

    return data.routeIds.map<StopReliability>((routeId) => {
      const slot = agg.get(routeId);
      if (!slot || slot.samples === 0) {
        return {
          routeId,
          stopId: data.stopId,
          onTimePct: 0,
          meanDelaySec: 0,
          sampleCount: 0,
          tier: "unknown",
        };
      }
      const onTimePct = Math.round((slot.sumWeightedOnTime / slot.samples) * 100);
      const meanDelaySec = Math.round(slot.sumWeightedDelay / slot.samples);
      return {
        routeId,
        stopId: data.stopId,
        onTimePct,
        meanDelaySec,
        sampleCount: slot.samples,
        tier: tierFor(onTimePct, slot.samples),
      };
    });
  });

/**
 * Aggregate multiple per-route stop-scoped rows into a single stop-wide
 * reliability score. Weights each route by its observation count so a
 * high-frequency route dominates fairly. Returns `unknown` tier when the
 * combined sample size is below the rated threshold.
 */
export function aggregateStopReliability(
  rows: StopReliability[],
): Omit<StopReliability, "routeId"> & { routeIds: string[] } {
  const rated = rows.filter((r) => r.sampleCount > 0);
  if (rated.length === 0) {
    return {
      stopId: rows[0]?.stopId ?? "",
      routeIds: rows.map((r) => r.routeId),
      onTimePct: 0,
      meanDelaySec: 0,
      sampleCount: 0,
      tier: "unknown",
    };
  }
  let sumOnTime = 0;
  let sumDelay = 0;
  let samples = 0;
  for (const r of rated) {
    sumOnTime += (r.onTimePct / 100) * r.sampleCount;
    sumDelay += r.meanDelaySec * r.sampleCount;
    samples += r.sampleCount;
  }
  const onTimePct = Math.round((sumOnTime / samples) * 100);
  const meanDelaySec = Math.round(sumDelay / samples);
  return {
    stopId: rated[0].stopId,
    routeIds: rows.map((r) => r.routeId),
    onTimePct,
    meanDelaySec,
    sampleCount: samples,
    tier: tierFor(onTimePct, samples),
  };
}

