import type { CityNow } from "./network-now";
// Aggregates the learned delay statistics into a network-wide "Pulse":
// on-time percentage, hottest and coldest routes, reliability scoreboard.
// Read-only, public. Safe to expose without auth.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ROUTES } from "@/lib/gtfs";
import { createLogger } from "./logger";

const log = createLogger("pulse");

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

export const getPulse = createServerFn({ method: "GET" })
  .inputValidator((input?: unknown) => z.void().optional().parse(input))
  .handler(async () => {
  const [{ supabaseAdmin }] = await Promise.all([import("@/integrations/supabase/client.server")]);
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
  for (const row of data as Array<{
    route_id: string;
    sum_delay_weighted: number;
    sample_count: number;
  }>) {
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
      ? Math.round(stats.reduce((s, r) => s + r.onTimePct * r.sampleCount, 0) / totalSamples)
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
    const [{ fetchRealtime }] = await Promise.all([import("@/lib/gtfs-rt.server")]);
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
        ? Math.round(
            stats.reduce((sum, row) => sum + row.onTimePct * row.sampleCount, 0) / totalSamples,
          )
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
// Live pulse: the same Network now numbers the Pulse page shows, computed by
// computeNetworkNow (src/lib/network-now.ts) from the live GTFS-RT snapshot.
// On time = 1 min early to 5 min late, buses with a live position that have
// left their first stop, one reading per bus at its next stop.
// ---------------------------------------------------------------------------

export type LivePulse = {
  generatedAt: number;
  windowMinutes: number; // 0: a live reading, not a window
  observations: number; // buses counted
  onTimePct: number;
  earlyPct: number;
  latePct: number;
  medianDelaySec: number;
  liveBuses?: number;
  avgDelaySec?: number;
  delayedCount?: number;
  cities?: CityNow[];
};

export const getLivePulse = createServerFn({ method: "GET" })
  .inputValidator((input?: unknown) => z.void().optional().parse(input))
  .handler(async () => {
    const [{ fetchRealtime }, { getRoute }, { computeNetworkNow }] = await Promise.all([
      import("./gtfs-rt.server"),
      import("./gtfs"),
      import("./network-now"),
    ]);
    let snap: Awaited<ReturnType<typeof fetchRealtime>> | null = null;
    try {
      snap = await fetchRealtime();
    } catch {
      snap = null;
    }
    const n = computeNetworkNow(snap, (id) => getRoute(id)?.agency);
    return {
      generatedAt: n.fetchedAt,
      windowMinutes: 0,
      observations: n.tracked,
      onTimePct: n.onTimePct,
      earlyPct: n.earlyPct,
      latePct: n.latePct,
      medianDelaySec: n.medianDelaySec,
      liveBuses: n.liveBuses,
      avgDelaySec: n.avgDelaySec,
      delayedCount: n.late,
      cities: n.cities,
    } satisfies LivePulse;
  });

// ---------------------------------------------------------------------------
// Hourly strip — last 24 hours of mean delay bucketed by clock hour.
// Powers the "today, hour by hour" visualization on the Pulse page.
// Uses Cyprus local time (EET/EEST, UTC+2 in winter / +3 in summer).
// ---------------------------------------------------------------------------

export type HourBucket = {
  hour: number; // 0-23, local Cyprus time
  meanDelaySec: number; // raw mean (not dedup'd) — directionally accurate
  sampleCount: number;
};

export type HourStrip = {
  generatedAt: number;
  nowHour: number; // current Cyprus-local hour
  buckets: HourBucket[]; // 24, even empty ones present with sampleCount=0
};

function cyprusOffsetMinutes(d: Date): number {
  // EEST (UTC+3) from last Sunday of March → last Sunday of October, else EET (+2).
  const y = d.getUTCFullYear();
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(y, month + 1, 0));
    return new Date(Date.UTC(y, month, last.getUTCDate() - last.getUTCDay()));
  };
  const dstStart = lastSunday(2); // March
  const dstEnd = lastSunday(9); // October
  const inDst = d >= dstStart && d < dstEnd;
  return inDst ? 180 : 120;
}

export const getPulseHourStrip = createServerFn({ method: "GET" })
  .inputValidator((input?: unknown) => z.void().optional().parse(input))
  .handler(async () => {
  const sums = new Array(24).fill(0);
  const counts = new Array(24).fill(0);

  try {
    const { db } = await import("@/lib/db");
    const res = await db.rpc("pulse_hour_strip");
    if (!res.error) {
      const data = (res.data ?? []) as Array<{
        hour_of_day: number;
        sample_count: number;
        mean_delay_sec: number;
      }>;
      for (const row of data) {
        const h = ((row.hour_of_day % 24) + 24) % 24;
        counts[h] = Number(row.sample_count) || 0;
        sums[h] = (Number(row.mean_delay_sec) || 0) * counts[h];
      }
    } else {
      log.error("pulse_hour_strip RPC failed", undefined, { error: res.error.message });
    }
  } catch (e) {
    log.error("pulse_hour_strip RPC threw", e);
  }

  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + cyprusOffsetMinutes(now);
  const nowHour = ((Math.floor(nowMinutes / 60) % 24) + 24) % 24;
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    sampleCount: counts[h],
    meanDelaySec: counts[h] > 0 ? Math.round(sums[h] / counts[h]) : 0,
  }));

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    nowHour,
    buckets,
  } satisfies HourStrip;
});
