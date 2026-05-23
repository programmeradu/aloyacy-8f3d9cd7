// Aggregates the learned delay statistics into a network-wide "Pulse":
// on-time percentage, hottest and coldest routes, reliability scoreboard.
// Read-only, public. Safe to expose without auth.

import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ROUTES } from "@/lib/gtfs";

const KNOWN_ROUTE_IDS = new Set(ROUTES.map((r) => r.id));

export type PulseRouteStat = {
  routeId: string;
  meanDelaySec: number;
  sampleCount: number;
  onTimePct: number; // proxied as 1 - |mean|/300, clamped
};

export type PulseSnapshot = {
  generatedAt: number;
  totalSamples: number;
  onTimePct: number;
  routesTracked: number;
  excludedUnknown: number; // route_ids in the feed not in our static timetable
  hottest: PulseRouteStat[]; // running late
  coldest: PulseRouteStat[]; // running early
  steadiest: PulseRouteStat[]; // closest to zero with high sample count
};

export const getPulse = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabase
    .from("delay_stats")
    .select("route_id, mean_delay_sec, sample_count")
    .gte("sample_count", 3)
    .limit(5000);

  if (error || !data) {
    return {
      generatedAt: Math.floor(Date.now() / 1000),
      totalSamples: 0,
      onTimePct: 0,
      routesTracked: 0,
      excludedUnknown: 0,
      hottest: [],
      coldest: [],
      steadiest: [],
    } satisfies PulseSnapshot;
  }

  // Collapse per-hour buckets into per-route weighted means.
  // Drop rows whose route_id isn't in our static timetable — they'd render as "?".
  const agg = new Map<
    string,
    { sumDelayWeighted: number; sampleCount: number }
  >();
  const excludedRoutes = new Set<string>();
  for (const row of data) {
    if (!KNOWN_ROUTE_IDS.has(row.route_id)) {
      excludedRoutes.add(row.route_id);
      continue;
    }
    const cur = agg.get(row.route_id) ?? { sumDelayWeighted: 0, sampleCount: 0 };
    cur.sumDelayWeighted += row.mean_delay_sec * row.sample_count;
    cur.sampleCount += row.sample_count;
    agg.set(row.route_id, cur);
  }

  const stats: PulseRouteStat[] = [...agg.entries()].map(([routeId, v]) => {
    const meanDelaySec = v.sampleCount > 0 ? v.sumDelayWeighted / v.sampleCount : 0;
    const onTimePct = Math.max(
      0,
      Math.min(100, Math.round((1 - Math.min(Math.abs(meanDelaySec), 300) / 300) * 100)),
    );
    return { routeId, meanDelaySec, sampleCount: v.sampleCount, onTimePct };
  });

  const totalSamples = stats.reduce((s, r) => s + r.sampleCount, 0);
  const onTimePct =
    totalSamples > 0
      ? Math.round(
          stats.reduce(
            (s, r) => s + r.onTimePct * r.sampleCount,
            0,
          ) / totalSamples,
        )
      : 0;

  const hottest = [...stats]
    .filter((s) => s.meanDelaySec > 30 && s.sampleCount >= 5)
    .sort((a, b) => b.meanDelaySec - a.meanDelaySec)
    .slice(0, 5);

  const coldest = [...stats]
    .filter((s) => s.meanDelaySec < -30 && s.sampleCount >= 5)
    .sort((a, b) => a.meanDelaySec - b.meanDelaySec)
    .slice(0, 5);

  const steadiest = [...stats]
    .filter((s) => s.sampleCount >= 8)
    .sort((a, b) => Math.abs(a.meanDelaySec) - Math.abs(b.meanDelaySec))
    .slice(0, 5);

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    totalSamples,
    onTimePct,
    routesTracked: stats.length,
    hottest,
    coldest,
    steadiest,
  } satisfies PulseSnapshot;
});
