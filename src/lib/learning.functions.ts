// Server fns for the learning pipeline output (delay_stats).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const getLearnedStatsForStop = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ stopId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const dow = now.getUTCDay();
    const { data: rows, error } = await supabase
      .from("delay_stats")
      .select("route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count")
      .eq("stop_id", data.stopId)
      .eq("hour_of_day", hour)
      .eq("day_of_week", dow);
    if (error) {
      console.error("delay_stats read failed", error);
      return { stats: [] };
    }
    return { stats: rows ?? [] };
  });

/**
 * Bulk lookup for a list of stops — used by the home page to apply
 * learned bias to every nearby stop card in a single round-trip.
 * Returns a flat array of stats; client builds its own keyed map.
 */
export const getLearnedStatsBulk = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ stopIds: z.array(z.string().min(1)).min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const dow = now.getUTCDay();
    const { data: rows, error } = await supabase
      .from("delay_stats")
      .select("route_id, stop_id, mean_delay_sec, sample_count")
      .in("stop_id", data.stopIds)
      .eq("hour_of_day", hour)
      .eq("day_of_week", dow);
    if (error) {
      console.error("delay_stats bulk read failed", error);
      return { stats: [] };
    }
    return { stats: rows ?? [] };
  });

/**
 * Accuracy snapshot for the hidden /debug/eta page. Pulls the most
 * recent observed_arrivals rows (where we recorded the operator's
 * predicted arrival vs. when the bus actually passed) and rolls them
 * into per-route accuracy buckets.
 */
export const getAccuracySnapshot = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        hours: z.number().int().min(1).max(168).default(24),
        limit: z.number().int().min(10).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sinceIso = new Date(Date.now() - data.hours * 3_600_000).toISOString();
    const { data: rows, error } = await supabase
      .from("observed_arrivals")
      .select("route_id, stop_id, trip_id, last_delay_sec, last_predicted_arrival, passed_at, last_seen_at")
      .gte("last_seen_at", sinceIso)
      .order("last_seen_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error("observed_arrivals read failed", error);
      return { recent: [], byRoute: [], totals: { count: 0, meanSec: 0, p50Sec: 0, p90Sec: 0 } };
    }
    const list = rows ?? [];

    // Per-route bucket
    const buckets = new Map<string, number[]>();
    for (const r of list) {
      const arr = buckets.get(r.route_id) ?? [];
      arr.push(r.last_delay_sec ?? 0);
      buckets.set(r.route_id, arr);
    }
    const byRoute = [...buckets.entries()]
      .map(([routeId, deltas]) => {
        const sorted = [...deltas].sort((a, b) => Math.abs(a) - Math.abs(b));
        const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
        const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
        const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
        return {
          routeId,
          count: deltas.length,
          meanSec: Math.round(mean),
          p50AbsSec: Math.abs(p50),
          p90AbsSec: Math.abs(p90),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Totals
    const allAbs = list.map((r) => Math.abs(r.last_delay_sec ?? 0)).sort((a, b) => a - b);
    const meanSec = Math.round(list.reduce((s, r) => s + (r.last_delay_sec ?? 0), 0) / Math.max(1, list.length));
    const p50Sec = allAbs[Math.floor(allAbs.length * 0.5)] ?? 0;
    const p90Sec = allAbs[Math.floor(allAbs.length * 0.9)] ?? 0;

    return {
      recent: list.slice(0, 50).map((r) => ({
        routeId: r.route_id,
        stopId: r.stop_id,
        tripId: r.trip_id,
        delaySec: r.last_delay_sec ?? 0,
        predictedAt: r.last_predicted_arrival,
        passedAt: r.passed_at,
        seenAt: r.last_seen_at,
      })),
      byRoute,
      totals: { count: list.length, meanSec, p50Sec, p90Sec },
    };
  });
