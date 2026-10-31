import { ogImage } from "@/lib/og-url";
import { createFileRoute } from "@tanstack/react-router";
import { RoamPage } from "@/components/roam/RoamPage";
import { useRoamI18n } from "@/lib/roam-i18n";
import {
  PulseHappening,
  PulseRare,
  PulseTraffic,
  PulseWarnings,
  hasTraffic,
  hasWarnings,
} from "@/components/PulseLiveSection";
import { usePulseFixture } from "@/components/pulse-live/fixture";
import { CrowdEyesCard, lineKey } from "@/components/pulse/CrowdEyesCard";
import { useMemo } from "react";
import { TodayIsland, TodayPair, TodayStory } from "@/components/pulse/TodayEditorial";
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
  // QA only: ?fx=cards shows the rarer live cards with fixed data.
  const fixture = usePulseFixture();
  const signals = fixture ?? liveSignals;
  // One source for every on-time number on this page.
  const { now: net, vehicles } = useNetworkNow();
  const watchedKeys = useMemo(
    () => new Set((crowdEyes?.routes ?? []).map((x) => lineKey(x.short))),
    [crowdEyes?.routes],
  );
  const dateLine = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Nicosia",
  }).format(new Date());
  const tiles = today?.tiles ?? [];
  const islandLive = !!signals && (hasWarnings(signals) || hasTraffic(signals));
  const watching = !!crowdEyes && crowdEyes.routes.length > 0;
  const seeds = !!crowdEyes && crowdEyes.seeds.length > 0;

  // A widget board, fun and live in turn, so no two heavy cards meet:
  // Network now (small) / Cyprus today (hero) / word and fact (pair) /
  // live map and tiles / On the island (list) / news, events, football /
  // Still dark (chips) / sea, sky and air / footer. Same order in EN and EL.
  return (
    <RoamPage title={r("pulse.title")} sub={dateLine}>
      <NetworkNowCard now={net} buckets={hourly?.buckets ?? []} nowHour={hourly?.nowHour ?? null} />
      <div className="r-legacy r-pulse">
        {today && <TodayStory briefing={today} locale={locale} t={t} />}
        {today && <TodayPair briefing={today} locale={locale} t={t} />}

        <LiveNetworkSection now={net} vehicles={vehicles} />

        {(tiles.length > 0 || islandLive) && (
          <TodayIsland
            tiles={tiles}
            isEl={locale === "el"}
            t={t}
            before={signals ? <PulseWarnings bundle={signals} locale={locale} /> : null}
            after={signals ? <PulseTraffic bundle={signals} locale={locale} /> : null}
          />
        )}

        {signals && <PulseHappening bundle={signals} locale={locale} />}

        {(watching || seeds) && crowdEyes && (
          <section className="r-pulse-sec r-pulse-crowdset animate-rise">
            {seeds && (
              <CrowdEyesCard kind="seed" routes={crowdEyes.seeds} t={t} exclude={watchedKeys} />
            )}
            {watching && <CrowdEyesCard routes={crowdEyes.routes} t={t} />}
          </section>
        )}

        {signals && <PulseRare bundle={signals} locale={locale} />}

        <p className="r-lbl text-center pt-8 pb-2">{t("pulse.updated")}</p>
      </div>
    </RoamPage>
  );
}
