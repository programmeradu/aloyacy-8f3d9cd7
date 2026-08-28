// D2 skip rate. Silent below 8 visits or 15%. Stop-level, not the row —
// wait-or-bail already uses "skip" for a ghost bus.

import { useQuery } from "@tanstack/react-query";
import type { HeadwayWhen } from "@aloya/core/headway-chance";
import type { SkipRate } from "@aloya/core/skip-rate";
import { getRoute } from "@/lib/gtfs";
import { useI18n, type DictKey } from "@/lib/i18n";

const WHEN_KEY: Record<HeadwayWhen, DictKey> = {
  weekdayMorning: "stop.headway.weekdayMorning",
  weekdayAfternoon: "stop.headway.weekdayAfternoon",
  weekdayEvening: "stop.headway.weekdayEvening",
  weekdayNight: "stop.headway.weekdayNight",
  weekendMorning: "stop.headway.weekendMorning",
  weekendAfternoon: "stop.headway.weekendAfternoon",
  weekendEvening: "stop.headway.weekendEvening",
  weekendNight: "stop.headway.weekendNight",
};

async function loadRates(stopId: string): Promise<SkipRate[]> {
  const res = await fetch("/api/public/stop-skip", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ stopId }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { rates?: SkipRate[] };
  return json.rates ?? [];
}

export function StopSkipRate({ stopId, inset }: { stopId: string; inset?: boolean }) {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["stop-skip", stopId],
    queryFn: () => loadRates(stopId),
    staleTime: 5 * 60_000,
  });
  const rates = q.data ?? [];
  if (rates.length === 0) return null;

  const lines = (
    <ul className="space-y-1">
      {rates.map((r) => {
        const short = getRoute(r.routeId)?.short ?? r.routeId;
        return (
          <li key={r.routeId} className="text-[13px] leading-snug text-ink">
            {t("stop.skipRate", { route: short, k: r.k, when: t(WHEN_KEY[r.when]) })}
          </li>
        );
      })}
    </ul>
  );

  if (inset) return <div className="mt-3">{lines}</div>;
  return (
    <section className="px-6 pb-5 animate-rise" style={{ animationDelay: "90ms" }}>
      {lines}
    </section>
  );
}
