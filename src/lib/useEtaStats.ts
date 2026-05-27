// React hook fetching segment_speeds + dwell_observations for a set of
// routes via `getEtaStatsForRoutes`. Keyed by sorted routeId set so
// repeated mounts on the same stop reuse the same query cache entry.
//
// Returns empty maps until the fetch resolves; smartEtaV2 degrades
// gracefully to URBAN/INTERCITY fallbacks in that case.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEtaStatsForRoutes } from "./eta-stats.functions";
import type { SegmentStatMap, DwellStatMap } from "./eta-v2";

export type EtaStats = { segments: SegmentStatMap; dwells: DwellStatMap };

const EMPTY: EtaStats = { segments: {}, dwells: {} };

export function useEtaStats(routeIds: string[]): EtaStats {
  const fetchStats = useServerFn(getEtaStatsForRoutes);
  const dedup = Array.from(new Set(routeIds)).sort();
  const key = dedup.join("|");

  const { data } = useQuery({
    queryKey: ["eta-stats", key],
    enabled: dedup.length > 0,
    // Stats are bucketed by hour-of-day; refresh every 5 min covers the
    // bucket boundary cheaply.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: () => fetchStats({ data: { routeIds: dedup } }),
  });

  return data ?? EMPTY;
}
