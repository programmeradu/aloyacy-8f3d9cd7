import { ogImage } from "@/lib/og-url";
import { createFileRoute } from "@tanstack/react-router";
import { RoamPage } from "@/components/roam/RoamPage";
import { Squiggle } from "@/components/roam/bits";
import { useRoamI18n } from "@/lib/roam-i18n";
import { PulseLiveSection } from "@/components/PulseLiveSection";
import { RoadPulseCard } from "@/components/pulse/RoadPulseCard";
import { CrowdEyesCard } from "@/components/pulse/CrowdEyesCard";
import { TodayEditorial } from "@/components/pulse/TodayEditorial";
import { usePulseData } from "@/components/pulse/usePulseData";
import { LiveNetworkSection } from "@/components/pulse/LiveNetworkSection";
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
  const { today, live, hourly, crowdEyes, liveSignals } = usePulseData();
  const hasLive = !!live && (live.observations ?? 0) > 0;
  const dateLine = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Nicosia",
  }).format(new Date());

  return (
    <RoamPage title={r("pulse.title")} sub={dateLine}>
      <section
        className="r-card r-rise"
        style={{ background: "var(--r-char)", color: "#fff", padding: "18px 20px" }}
      >
        <p className="r-lbl" style={{ color: "var(--r-onchar-mute)" }}>
          {r("pulse.networkNow")}
        </p>
        {hasLive ? (
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="r-num-xl" style={{ color: "#fff" }}>
                {Math.round(live!.onTimePct)}%
              </p>
              <p className="r-lbl mt-2" style={{ color: "var(--r-onchar-mute)" }}>
                {r("pulse.onTimeShare")}
              </p>
            </div>
            <Squiggle width={120} height={44} />
          </div>
        ) : (
          <p className="r-t3 mt-2">{r("pulse.learning")}</p>
        )}
      </section>
      <div className="r-legacy -mx-4 mt-2">
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

        <LiveNetworkSection />

        {crowdEyes && crowdEyes.routes.length > 0 && (
          <section className="px-6 mt-4 animate-rise" style={{ animationDelay: "160ms" }}>
            <CrowdEyesCard routes={crowdEyes.routes} t={t} />
          </section>
        )}

        {crowdEyes && crowdEyes.seeds.length > 0 && (
          <section className="px-6 mt-4 animate-rise" style={{ animationDelay: "180ms" }}>
            <CrowdEyesCard kind="seed" routes={crowdEyes.seeds} t={t} />
          </section>
        )}

        {liveSignals && <PulseLiveSection bundle={liveSignals} locale={locale} />}

        <div className="px-6 pt-8 pb-2">
          <p className="text-center font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {t("pulse.updated")}
          </p>
        </div>
      </div>
    </RoamPage>
  );
}
