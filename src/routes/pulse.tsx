import { ogImage } from "@/lib/og-url";
import { createFileRoute } from "@tanstack/react-router";
import { RoamPage } from "@/components/roam/RoamPage";
import { useRoamI18n } from "@/lib/roam-i18n";
import { PulseLiveSection } from "@/components/PulseLiveSection";
import { RoadPulseCard } from "@/components/pulse/RoadPulseCard";
import { CrowdEyesCard } from "@/components/pulse/CrowdEyesCard";
import { TodayEditorial } from "@/components/pulse/TodayEditorial";
import { usePulseData } from "@/components/pulse/usePulseData";
import { LiveNetworkSection } from "@/components/pulse/LiveNetworkSection";
import { NetworkNowCard } from "@/components/pulse/NetworkNowCard";
import { useNetworkNow } from "@/components/pulse/useNetworkNow";
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
      { property: "og:image", content: ogImage("/api/public/og/default") },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Hand-painted map of Cyprus with ochre buses tracing routes across the island.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage("/api/public/og/default") },
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
  const { r } = useRoamI18n();
  const { today, hourly, crowdEyes, liveSignals } = usePulseData();
  // One source for every on-time number on this page.
  const { now: net, vehicles } = useNetworkNow();
  const dateLine = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Nicosia",
  }).format(new Date());

  return (
    <RoamPage title={r("pulse.title")} sub={dateLine}>
      <NetworkNowCard
        now={net}
        buckets={hourly?.buckets ?? []}
        nowHour={hourly?.nowHour ?? null}
      />
      <div className="r-legacy r-pulse">
        {today && <TodayEditorial briefing={today} locale={locale} t={t} />}

        <section className="mt-4 animate-rise" style={{ animationDelay: "120ms" }}>
          <RoadPulseCard
            kicker={r("pulse.nn.rightNow")}
            basis={r("pulse.nn.basis", { n: net?.tracked ?? 0 })}
            onTimePct={net?.onTimePct ?? 0}
            latePct={net?.latePct ?? 0}
            earlyPct={net?.earlyPct ?? 0}
            observations={net?.tracked ?? 0}
            medianSec={net?.medianDelaySec ?? 0}
            buckets={hourly?.buckets ?? []}
            nowHour={hourly?.nowHour ?? new Date().getHours()}
            t={t}
          />
        </section>

        <LiveNetworkSection now={net} vehicles={vehicles} />

        {crowdEyes && crowdEyes.routes.length > 0 && (
          <section className="mt-4 animate-rise" style={{ animationDelay: "160ms" }}>
            <CrowdEyesCard routes={crowdEyes.routes} t={t} />
          </section>
        )}

        {crowdEyes && crowdEyes.seeds.length > 0 && (
          <section className="mt-4 animate-rise" style={{ animationDelay: "180ms" }}>
            <CrowdEyesCard kind="seed" routes={crowdEyes.seeds} t={t} />
          </section>
        )}

        {liveSignals && <PulseLiveSection bundle={liveSignals} locale={locale} />}

        <p className="r-lbl text-center pt-8 pb-2">{t("pulse.updated")}</p>
      </div>
    </RoamPage>
  );
}
