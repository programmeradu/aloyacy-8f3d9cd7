// C2 feed-vs-rider clock. Silent below 8 samples or 2 minutes.

import { useQuery } from "@tanstack/react-query";
import type { FeedDeltaHint } from "@aloya/core/feed-delta";
import { getRoute } from "@/lib/gtfs";
import { useI18n } from "@/lib/i18n";

async function loadHints(stopId: string): Promise<FeedDeltaHint[]> {
  const res = await fetch("/api/public/feed-delta", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ stopId }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { hints?: FeedDeltaHint[] };
  return json.hints ?? [];
}

export function StopFeedDelta({ stopId, inset }: { stopId: string; inset?: boolean }) {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["feed-delta", stopId],
    queryFn: () => loadHints(stopId),
    staleTime: 5 * 60_000,
  });
  const hints = q.data ?? [];
  if (hints.length === 0) return null;

  const lines = (
    <ul className="space-y-1">
      {hints.map((h) => {
        const short = getRoute(h.routeId)?.short ?? h.routeId;
        return (
          <li key={h.routeId} className="text-[13px] leading-snug text-ink">
            {t("stop.feedDelta", { route: short, m: h.minutes })}
          </li>
        );
      })}
    </ul>
  );

  if (inset) return <div className="mt-3">{lines}</div>;
  return (
    <section className="px-6 pb-5 animate-rise" style={{ animationDelay: "100ms" }}>
      {lines}
    </section>
  );
}
