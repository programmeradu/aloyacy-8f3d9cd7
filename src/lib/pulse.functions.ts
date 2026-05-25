// Aggregates the learned delay statistics into a network-wide "Pulse":
// on-time percentage, hottest and coldest routes, reliability scoreboard.
// Read-only, public. Safe to expose without auth.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ROUTES } from "@/lib/gtfs";
import { fetchRealtime } from "@/lib/gtfs-rt.server";

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
  const freshThresholdIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: freshness } = await supabaseAdmin
    .from("delay_stats")
    .select("updated_at")
    .gte("updated_at", freshThresholdIso)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!freshness) {
    return buildPulseFromRealtime();
  }

  // Server-side aggregation via RPC — collapses tens of thousands of
  // (route, stop, hour) buckets into one row per route in a single call.
  const { data, error } = await supabaseAdmin.rpc("pulse_route_stats");

  if (error || !data || data.length === 0) {
    return buildPulseFromRealtime();
  }

  // Filter out routes that aren't in our static timetable — they'd render as "?".
  const excludedRoutes = new Set<string>();
  const agg = new Map<string, { sumDelayWeighted: number; sampleCount: number }>();
  for (const row of data as Array<{ route_id: string; sum_delay_weighted: number; sample_count: number }>) {
    if (!KNOWN_ROUTE_IDS.has(row.route_id)) {
      excludedRoutes.add(row.route_id);
      continue;
    }
    agg.set(row.route_id, {
      sumDelayWeighted: Number(row.sum_delay_weighted) || 0,
      sampleCount: Number(row.sample_count) || 0,
    });
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
    excludedUnknown: excludedRoutes.size,
    hottest,
    coldest,
    steadiest,
  } satisfies PulseSnapshot;
});

async function buildPulseFromRealtime(): Promise<PulseSnapshot> {
  try {
    const rt = await fetchRealtime();
    if (!rt.arrivals.length) {
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

    const excludedRoutes = new Set<string>();
    const byRoute = new Map<string, { sumDelay: number; sampleCount: number }>();

    for (const row of rt.arrivals) {
      if (!KNOWN_ROUTE_IDS.has(row.routeId)) {
        excludedRoutes.add(row.routeId);
        continue;
      }
      const agg = byRoute.get(row.routeId) ?? { sumDelay: 0, sampleCount: 0 };
      agg.sumDelay += row.delaySec;
      agg.sampleCount += 1;
      byRoute.set(row.routeId, agg);
    }

    const stats: PulseRouteStat[] = [...byRoute.entries()].map(([routeId, v]) => {
      const meanDelaySec = v.sampleCount > 0 ? v.sumDelay / v.sampleCount : 0;
      const onTimePct = Math.max(
        0,
        Math.min(100, Math.round((1 - Math.min(Math.abs(meanDelaySec), 300) / 300) * 100)),
      );
      return { routeId, meanDelaySec, sampleCount: v.sampleCount, onTimePct };
    });

    const totalSamples = stats.reduce((sum, row) => sum + row.sampleCount, 0);
    const onTimePct =
      totalSamples > 0
        ? Math.round(stats.reduce((sum, row) => sum + row.onTimePct * row.sampleCount, 0) / totalSamples)
        : 0;

    return {
      generatedAt: rt.fetchedAt,
      totalSamples,
      onTimePct,
      routesTracked: stats.length,
      excludedUnknown: excludedRoutes.size,
      hottest: [...stats]
        .filter((row) => row.meanDelaySec > 30)
        .sort((a, b) => b.meanDelaySec - a.meanDelaySec)
        .slice(0, 5),
      coldest: [...stats]
        .filter((row) => row.meanDelaySec < -30)
        .sort((a, b) => a.meanDelaySec - b.meanDelaySec)
        .slice(0, 5),
      steadiest: [...stats]
        .filter((row) => row.sampleCount >= 2)
        .sort((a, b) => Math.abs(a.meanDelaySec) - Math.abs(b.meanDelaySec))
        .slice(0, 5),
    } satisfies PulseSnapshot;
  } catch {
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
}

// ---------------------------------------------------------------------------
// Live pulse — last 60 minutes of observed snapshots.
// Honest, strict "on time" definition: |delay| < 90s. Counts unique
// (trip_id, stop_id) pairs so a bus pinged 5 times near a stop counts once.
// ---------------------------------------------------------------------------

export type LivePulse = {
  generatedAt: number;
  windowMinutes: number;
  observations: number; // unique trip×stop events in the window
  onTimePct: number; // % with |delay| < 90s
  earlyPct: number; // delay < -90s
  latePct: number; // delay > 90s
  medianDelaySec: number;
};

export const getLivePulse = createServerFn({ method: "GET" }).handler(async () => {
  const WINDOW_MIN = 60;
  const sinceIso = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const PAGE = 1000;
  const HARD_CAP = 50_000;

  type Row = { trip_id: string; stop_id: string; delay_sec: number; captured_at: string };
  const rows: Row[] = [];
  for (let from = 0; from < HARD_CAP; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("rt_snapshots")
      .select("trip_id, stop_id, delay_sec, captured_at")
      .gte("captured_at", sinceIso)
      .order("captured_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }

  // Deduplicate: keep the latest snapshot per (trip_id, stop_id).
  // rows are already ordered newest-first per page; first wins.
  const latest = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.trip_id}|${r.stop_id}`;
    if (!latest.has(key)) latest.set(key, r.delay_sec);
  }

  const delays = [...latest.values()];
  if (delays.length === 0) {
    return {
      generatedAt: Math.floor(Date.now() / 1000),
      windowMinutes: WINDOW_MIN,
      observations: 0,
      onTimePct: 0,
      earlyPct: 0,
      latePct: 0,
      medianDelaySec: 0,
    } satisfies LivePulse;
  }

  let onTime = 0;
  let early = 0;
  let late = 0;
  for (const d of delays) {
    if (d > 90) late++;
    else if (d < -90) early++;
    else onTime++;
  }
  const sorted = [...delays].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const n = delays.length;
  return {
    generatedAt: Math.floor(Date.now() / 1000),
    windowMinutes: WINDOW_MIN,
    observations: n,
    onTimePct: Math.round((onTime / n) * 100),
    earlyPct: Math.round((early / n) * 100),
    latePct: Math.round((late / n) * 100),
    medianDelaySec: Math.round(median),
  } satisfies LivePulse;
});
