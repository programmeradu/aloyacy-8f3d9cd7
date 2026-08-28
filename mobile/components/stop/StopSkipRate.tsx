// D2 skip rate. Same number as the web stop page.

import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import type { HeadwayWhen } from "@aloya/core/headway-chance";
import { skipRateLine } from "@aloya/core/skip-rate";
import { skipRateNeighbourLine, type SpokenSkip } from "@aloya/core/skip-neighbour";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { useStopsBundle } from "@/lib/hooks";

const WHEN: Record<HeadwayWhen, string> = {
  weekdayMorning: "on weekday mornings",
  weekdayAfternoon: "on weekday afternoons",
  weekdayEvening: "on weekday evenings",
  weekdayNight: "on weekday nights",
  weekendMorning: "on weekend mornings",
  weekendAfternoon: "on weekend afternoons",
  weekendEvening: "on weekend evenings",
  weekendNight: "on weekend nights",
};

async function loadRates(stopId: string): Promise<SpokenSkip[]> {
  const res = await fetch(`${API_BASE}/api/public/stop-skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ stopId }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { rates?: SpokenSkip[] };
  return json.rates ?? [];
}

export function StopSkipRate({ stopId }: { stopId: string }) {
  const bundle = useStopsBundle();
  const q = useQuery({
    queryKey: ["stop-skip", stopId],
    queryFn: () => loadRates(stopId),
    staleTime: 5 * 60_000,
  });
  const rates = q.data ?? [];
  if (rates.length === 0) return null;

  return (
    <View style={{ marginTop: 12, gap: 4 }}>
      {rates.map((r) => {
        const short = bundle.data?.routes?.[r.routeId]?.short ?? r.routeId;
        const n = r.neighbour;
        const line = n
          ? skipRateNeighbourLine(short, r.k, WHEN[r.when], n.name, n.meters, n.compass)
          : skipRateLine(short, r.k, WHEN[r.when]);
        return (
          <Text
            key={r.routeId}
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 18,
              color: palette.ink,
            }}
          >
            {line}
          </Text>
        );
      })}
    </View>
  );
}
