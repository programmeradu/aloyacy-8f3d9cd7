// Live map + fleet stats, moved here from the old Explore home when Explore
// became the Sky Clock glass home (no map on home). Same data as before:
// the realtime snapshot (`useRealtime`).

import { useMemo } from "react";
import { MapPreview } from "@/components/MapPreview";
import { QuickStat } from "@/components/home/QuickStat";
import { useRealtime } from "@/lib/useRealtime";
import { useI18n } from "@/lib/i18n";
import statBus from "@/assets/stat-bus.png";
import statDial from "@/assets/stat-dial.png";

export function LiveNetworkSection() {
  const { t } = useI18n();
  const { data: rt } = useRealtime();
  const liveCount = rt?.vehicles.length ?? 0;
  const onTimePct = useMemo(() => {
    if (!rt) return null;
    const sampled = rt.arrivals.slice(0, 400);
    if (!sampled.length) return null;
    const ok = sampled.filter((a) => Math.abs(a.delaySec) <= 120).length;
    return Math.round((ok / sampled.length) * 100);
  }, [rt]);

  return (
    <section className="px-6 mt-8 animate-rise" style={{ animationDelay: "100ms" }}>
      <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {t("sky.network.kicker")}
      </p>
      <h2 className="font-display text-3xl mt-1 mb-4 text-ink">{t("sky.network.title")}</h2>
      <MapPreview hideLiveBadge placeName="Cyprus" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <QuickStat
          label={t("home.liveBuses")}
          value={liveCount ? String(liveCount) : "-"}
          tone="aegean"
          vignette={statBus}
          vignetteClass="right-1 bottom-1 w-[40%] opacity-[0.7] rotate-[-3deg]"
        />
        <QuickStat
          label={t("home.onTime")}
          value={onTimePct !== null ? `${onTimePct}%` : "-"}
          tone="olive"
          vignette={statDial}
          vignetteClass="right-1 bottom-1 w-[36%] opacity-[0.6]"
        />
      </div>
    </section>
  );
}
