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
  // Paginate through delay_stats — Supabase caps each response at 1000 rows
  // and the table has tens of thousands of (route, stop, hour) buckets.
  const PAGE = 1000;
  const HARD_CAP = 100_000; // safety belt
  const rows: { route_id: string; mean_delay_sec: number; sample_count: number }[] = [];
  let error: unknown = null;
  for (let from = 0; from < HARD_CAP; from += PAGE) {
    const { data, error: pageError } = await supabase
      .from("delay_stats")
      .select("route_id, mean_delay_sec, sample_count")
      .gte("sample_count", 3)
      .range(from, from + PAGE - 1);
    if (pageError) {
      error = pageError;
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  if (error || rows.length === 0) {
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

  const data = rows;


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
    excludedUnknown: excludedRoutes.size,
    hottest,
    coldest,
    steadiest,
  } satisfies PulseSnapshot;
});

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
    const { data, error } = await supabase
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
