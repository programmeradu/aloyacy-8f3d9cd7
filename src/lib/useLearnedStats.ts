// React hook returning a Map<stopId, Map<routeId, learnedStat>> for a set of stops.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLearnedStatsForStop } from "./learning.functions";
import type { LearnedStat } from "./predictor";

export function useLearnedStats(stopIds: string[]) {
  const fn = useServerFn(getLearnedStatsForStop);
  const key = stopIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["learned-stats", key],
    enabled: stopIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        stopIds.map((id) => fn({ data: { stopId: id } })),
      );
      const map = new Map<string, Map<string, LearnedStat>>();
      results.forEach((r, i) => {
        const inner = new Map<string, LearnedStat>();
        for (const row of r.stats) inner.set(row.route_id, row as LearnedStat);
        map.set(stopIds[i], inner);
      });
      return map;
    },
  });
}
