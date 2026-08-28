// C2 feed-vs-rider clock. Same number as the web stop page.

import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { feedDeltaLine, type FeedDeltaHint } from "@aloya/core/feed-delta";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { useStopsBundle } from "@/lib/hooks";

async function loadHints(stopId: string): Promise<FeedDeltaHint[]> {
  const res = await fetch(`${API_BASE}/api/public/feed-delta`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ stopId }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { hints?: FeedDeltaHint[] };
  return json.hints ?? [];
}

export function StopFeedDelta({ stopId }: { stopId: string }) {
  const bundle = useStopsBundle();
  const q = useQuery({
    queryKey: ["feed-delta", stopId],
    queryFn: () => loadHints(stopId),
    staleTime: 5 * 60_000,
  });
  const hints = q.data ?? [];
  if (hints.length === 0) return null;

  return (
    <View style={{ marginTop: 12, gap: 4 }}>
      {hints.map((h) => {
        const short = bundle.data?.routes?.[h.routeId]?.short ?? h.routeId;
        return (
          <Text
            key={h.routeId}
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 18,
              color: palette.ink,
            }}
          >
            {feedDeltaLine(short, h.minutes)}
          </Text>
        );
      })}
    </View>
  );
}
