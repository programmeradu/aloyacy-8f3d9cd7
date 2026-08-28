import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PulseLiveSection } from "@/components/PulseLiveSection";
import { RoadPulseCard } from "@/components/pulse/RoadPulseCard";
import { CrowdEyesCard } from "@/components/pulse/CrowdEyesCard";
import { TodayEditorial } from "@/components/pulse/TodayEditorial";
import { usePulseData } from "@/components/pulse/usePulseData";
import { useI18n } from "@/lib/i18n";
import { en } from "@/lib/dictionaries/en";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: en["pulse.meta.title"] },
      { name: "description", content: en["pulse.meta.desc"] },
      { property: "og:title", content: en["pulse.og.title"] },
      { property: "og:description", content: en["pulse.og.desc"] },
      { property: "og:url", content: "https://app.aloya.cy/pulse" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.aloya.cy/og/og-pulse.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Hand-painted map of Cyprus with ochre buses tracing routes across the island.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://app.aloya.cy/og/og-pulse.jpg" },
    ],
    links: [
      { rel: "canonical", href: "https://app.aloya.cy/pulse" },
      { rel: "alternate", hrefLang: "en", href: "https://app.aloya.cy/pulse" },
      { rel: "alternate", hrefLang: "el", href: "https://app.aloya.cy/pulse" },
      { rel: "alternate", hrefLang: "x-default", href: "https://app.aloya.cy/pulse" },
    ],
  }),
  component: Pulse,
});

function Pulse() {
  const { t, locale } = useI18n();
  const { today, live, hourly, crowdEyes, liveSignals } = usePulseData();

  return (
    <AppShell>
      {today && <TodayEditorial briefing={today} locale={locale} t={t} />}

      <section className="px-6 mt-8 animate-rise" style={{ animationDelay: "120ms" }}>
        <RoadPulseCard
          onTimePct={live?.onTimePct ?? 0}
          latePct={live?.latePct ?? 0}
          earlyPct={live?.earlyPct ?? 0}
          observations={live?.observations ?? 0}
          medianSec={live?.medianDelaySec ?? 0}
          buckets={hourly?.buckets ?? []}
          nowHour={hourly?.nowHour ?? new Date().getHours()}
          t={t}
        />
      </section>

      {crowdEyes && crowdEyes.routes.length > 0 && (
        <section className="px-6 mt-4 animate-rise" style={{ animationDelay: "160ms" }}>
          <CrowdEyesCard routes={crowdEyes.routes} t={t} />
        </section>
      )}

      {liveSignals && <PulseLiveSection bundle={liveSignals} locale={locale} />}

      <div className="px-6 pt-8 pb-2">
        <p className="text-center font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {t("pulse.updated")}
        </p>
      </div>
    </AppShell>
  );
}
