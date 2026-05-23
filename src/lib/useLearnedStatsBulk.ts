// Bulk hook — one round trip for every nearby stop on the home page.
// Returns Map<"stopId|routeId", { meanDelaySec, sampleCount }>.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLearnedStatsBulk } from "./learning.functions";
import type { LearnedBias } from "./eta";

export function useLearnedStatsBulk(stopIds: string[]) {
  const fn = useServerFn(getLearnedStatsBulk);
  const key = stopIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["learned-stats-bulk", key],
    enabled: stopIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fn({ data: { stopIds } });
      const byStop = new Map<string, Record<string, LearnedBias>>();
      for (const row of res.stats) {
        const inner = byStop.get(row.stop_id) ?? {};
        inner[row.route_id] = {
          meanDelaySec: row.mean_delay_sec,
          sampleCount: row.sample_count,
        };
        byStop.set(row.stop_id, inner);
      }
      return byStop;
    },
  });
}
