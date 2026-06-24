import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TodayTileGlyph } from "@/components/TodayTileGlyph";
import { PulseLiveSection } from "@/components/PulseLiveSection";
import { getLivePulse, getPulseHourStrip, type HourBucket } from "@/lib/pulse.functions";
import { getPulseLive } from "@/lib/pulse-live.functions";
import { useI18n, type DictKey } from "@/lib/i18n";
import { en } from "@/lib/dictionaries/en";
import { getTodayBriefing, type TodayBriefing, type TodayTheme } from "@/lib/today.functions";
import { useActiveTrip } from "@/lib/trip-store";
import pulseNetworkBand from "@/assets/pulse-network-band.jpg";
import todayDerby from "@/assets/today-derby.jpg";
import todayHeatwave from "@/assets/today-heatwave.jpg";
import todayCruise from "@/assets/today-cruise.jpg";
import todayFestival from "@/assets/today-festival.jpg";
import todayStorm from "@/assets/today-storm.jpg";
import todayCalm from "@/assets/today-calm.jpg";

const THEME_HERO: Record<TodayTheme, string> = {
  derby: todayDerby,
  heatwave: todayHeatwave,
  cruise: todayCruise,
  festival: todayFestival,
  storm: todayStorm,
  holiday: todayCalm,
  calm: todayCalm,
};

type T = (k: DictKey, vars?: Record<string, string | number>) => string;

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
      { name: "robots", content: "noindex, follow" },
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
  const todayFn = useServerFn(getTodayBriefing);
  const liveFn = useServerFn(getLivePulse);
  const hourFn = useServerFn(getPulseHourStrip);
  const pulseLiveFn = useServerFn(getPulseLive);

  // ── Location awareness ───────────────────────────────────────────────────
  const active = useActiveTrip();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (cancelled) return;
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60_000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Build briefing input — trip destination takes precedence, fall back to user coords.
  const briefingInput = useMemo(() => {
    const dest = active?.to;
    const round = (n: number) => Math.round(n * 100) / 100; // ~1 km bucket → cache-friendly
    return {
      lat: coords ? round(coords.lat) : undefined,
      lng: coords ? round(coords.lng) : undefined,
      destLat: dest ? round(dest.lat) : undefined,
      destLng: dest ? round(dest.lng) : undefined,
    };
  }, [coords, active?.to]);

  const { data: today } = useQuery({
    queryKey: ["today-briefing", briefingInput],
    queryFn: () => todayFn({ data: briefingInput }),
    refetchInterval: 10 * 60_000,
    staleTime: 9 * 60_000,
  });
  const { data: live } = useQuery({
    queryKey: ["pulse-live"],
    queryFn: () => liveFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: hourly } = useQuery({
    queryKey: ["pulse-hourly"],
    queryFn: () => hourFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });
  const liveSignalsInput = useMemo(
    () => ({ lat: briefingInput.lat, lng: briefingInput.lng }),
    [briefingInput.lat, briefingInput.lng],
  );
  const { data: liveSignals } = useQuery({
    queryKey: ["pulse-live-signals", liveSignalsInput],
    queryFn: () => pulseLiveFn({ data: liveSignalsInput }),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

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

      {liveSignals && <PulseLiveSection bundle={liveSignals} locale={locale} />}

      <div className="px-6 pt-8 pb-2">
        <p className="text-center font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {t("pulse.updated")}
        </p>
      </div>
    </AppShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Cyprus Today — editorial hero, tiles, verdict, fact                         */
/* ────────────────────────────────────────────────────────────────────────── */

function TodayEditorial({
  briefing,
  locale,
  t,
}: {
  briefing: TodayBriefing;
  locale: "en" | "el";
  t: T;
}) {
  const isEl = locale === "el";
  const hero = THEME_HERO[briefing.heroKey] ?? todayCalm;
  const headline = isEl ? briefing.headline.el : briefing.headline.en;
  const lede = isEl ? briefing.lede.el : briefing.lede.en;
  const verdict = isEl ? briefing.verdict.el : briefing.verdict.en;
  const weekday = isEl ? briefing.weekday.el : briefing.weekday.en;
  const factText = isEl ? briefing.fact.el : briefing.fact.en;
  const factKicker =
    briefing.fact.tag === "local" ? t("today.fact.local") : t("today.fact.tourist");

  const niceDate = (() => {
    const [, m, d] = briefing.date.split("-");
    const months = isEl
      ? ["Ιαν", "Φεβ", "Μάρ", "Απρ", "Μάι", "Ιούν", "Ιούλ", "Αύγ", "Σεπ", "Οκτ", "Νοέ", "Δεκ"]
      : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${weekday} · ${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
  })();

  return (
    <section className="px-6 pt-3 animate-rise">
      <p className="font-eyebrow text-[10px] uppercase tracking-[0.24em] text-ink-soft">
        {t("today.kicker")}
      </p>

      {/* Hero card */}
      <article className="relative mt-3 overflow-hidden rounded-[34px] bg-card ring-1 ring-line">
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <img
            src={hero}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover select-none"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 30%, transparent) 55%, var(--color-card) 100%)",
            }}
          />
          <div className="absolute left-5 top-5 right-5 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-sm px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink ring-1 ring-line">
              {niceDate}
            </p>
            {briefing.focus.scope !== "island" && (
              <p className="inline-flex items-center rounded-full bg-ink/85 backdrop-blur-sm px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-card ring-1 ring-ink/40">
                {briefing.focus.scope === "trip"
                  ? isEl ? `Προς ${briefing.focus.cityEl}` : `Heading to ${briefing.focus.city}`
                  : isEl ? `Στη ${briefing.focus.cityEl}` : `Around ${briefing.focus.city}`}
              </p>
            )}
          </div>
        </div>

        <div className="relative px-6 pt-4 pb-6">
          <h2 className="font-display text-[30px] leading-[1.05] text-ink text-balance">
            {headline}
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft text-pretty">{lede}</p>
        </div>
      </article>

      {/* Tiles */}
      {briefing.tiles.length > 0 && (
        <div className="mt-6">
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft mb-3">
            {t("today.tiles.kicker")}
          </p>
          <div className="grid gap-3">
            {briefing.tiles.map((tile, i) => (
              <TodayTileCard key={i} tile={tile} isEl={isEl} />
            ))}
          </div>
        </div>
      )}

      {/* Verdict */}
      <div className="relative mt-6 overflow-hidden rounded-[26px] bg-aegean-deep/[0.04] ring-1 ring-aegean-deep/15 px-6 py-5">
        <span
          aria-hidden
          className="absolute -top-3 left-4 font-display text-[72px] leading-none text-aegean-deep/15 select-none"
        >
          “
        </span>
        <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-aegean-deep mb-2">
          {t("today.verdict.kicker")}
        </p>
        <p className="font-display text-[18px] leading-snug text-ink text-balance">{verdict}</p>
      </div>

      {/* Fact — same illustrated treatment as the tile cards */}
      <article className="relative mt-4 overflow-hidden rounded-[22px] bg-card ring-1 ring-line">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 bg-gradient-to-bl ${
            briefing.fact.tag === "tourist" ? "from-aegean-deep/8" : "from-ochre/8"
          } to-transparent`}
        />
        <TodayTileGlyph
          kind={briefing.fact.tag === "tourist" ? "festival" : "nameday"}
          accent={briefing.fact.tag === "tourist" ? "aegean" : "ochre"}
          className="pointer-events-none absolute -right-2 -top-2 h-24 w-24 select-none"
        />
        <div className="relative p-5 pr-24">
          <p
            className={`font-eyebrow text-[9.5px] uppercase tracking-[0.24em] ${
              briefing.fact.tag === "tourist" ? "text-aegean-deep" : "text-ochre"
            }`}
          >
            {factKicker}
          </p>
          <p className="mt-2 font-display text-[16px] leading-snug text-ink text-balance break-soft">
            {factText}
          </p>
        </div>
      </article>

      {/* Greek word of the day — for visitors learning the language */}
      <article className="relative mt-4 overflow-hidden rounded-[22px] bg-card ring-1 ring-line">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-olive/12 via-transparent to-ochre/5"
        />
        <GreekWordGlyph word={briefing.greekWord.el} className="pointer-events-none absolute -right-3 -top-3 h-32 w-32" />
        <div className="relative p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.24em] text-olive">
              {t("today.greek.kicker")}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              /{briefing.greekWord.translit}/
            </p>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <p className="font-display text-[34px] leading-none text-ink">
              {briefing.greekWord.el}
            </p>
            <SpeakGreekButton text={briefing.greekWord.el} />
          </div>
          <p className="mt-2 font-display text-[15px] text-olive">
            {briefing.greekWord.en}
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft text-pretty">
            {briefing.greekWord.meaning}
          </p>
        </div>
      </article>
    </section>
  );
}

function TodayTileCard({ tile, isEl }: { tile: TodayBriefing["tiles"][number]; isEl: boolean }) {
  const accentText =
    tile.accent === "ochre"
      ? "text-ochre"
      : tile.accent === "aegean"
      ? "text-aegean-deep"
      : tile.accent === "olive"
      ? "text-olive"
      : "text-ink";

  // Soft wash background tinted by accent — replaces the lazy "line on the left".
  const wash =
    tile.accent === "ochre"
      ? "from-ochre/8"
      : tile.accent === "aegean"
      ? "from-aegean-deep/8"
      : tile.accent === "olive"
      ? "from-olive/8"
      : "from-ink/6";

  return (
    <article className="relative overflow-hidden rounded-[22px] bg-card ring-1 ring-line">
      {/* Tinted wash from top-right, behind the glyph */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-bl ${wash} to-transparent`}
      />

      {/* Bespoke contextual glyph */}
      <TodayTileGlyph
        kind={tile.kind}
        accent={tile.accent}
        className="pointer-events-none absolute -right-2 -top-2 h-24 w-24 select-none"
      />

      <div className="relative p-5 pr-24">
        <p className={`font-eyebrow text-[9.5px] uppercase tracking-[0.24em] ${accentText}`}>
          {isEl ? tile.kickerEl : tile.kicker}
        </p>
        <h3 className="mt-1.5 font-display text-[17px] leading-tight text-ink text-balance break-soft">
          {isEl ? tile.titleEl : tile.title}
        </h3>
        <p className="mt-2 pr-0 text-[13px] leading-snug text-ink-soft text-pretty">
          {isEl ? tile.detailEl : tile.detail}
        </p>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Road pulse — one tight card, replaces the old heavy stack                   */
/* ────────────────────────────────────────────────────────────────────────── */

function RoadPulseCard({
  onTimePct,
  latePct,
  earlyPct,
  observations,
  medianSec,
  buckets,
  nowHour,
  t,
}: {
  onTimePct: number;
  latePct: number;
  earlyPct: number;
  observations: number;
  medianSec: number;
  buckets: HourBucket[];
  nowHour: number;
  t: T;
}) {
  const hasData = observations > 0;
  const medianMin = Math.round(medianSec / 60);

  // Observation density across the day — for a horizontal "activity comb".
  const maxCount = Math.max(1, ...buckets.map((b) => b.sampleCount));
  const totalToday = buckets.reduce((s, b) => s + b.sampleCount, 0);

  return (
    <article className="relative overflow-hidden rounded-[28px] bg-card ring-1 ring-line">
      {/* Editorial illustration band — always visible, even when no live signal */}
      <div className="relative aspect-[16/7] w-full overflow-hidden">
        <img
          src={pulseNetworkBand}
          alt=""
          aria-hidden
          loading="lazy"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 40%, transparent) 55%, var(--color-card) 100%)",
          }}
        />
        <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-3">
          <div>
            <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("pulse.flow.kicker")}
            </p>
            <h2 className="mt-1 font-display text-[22px] leading-tight text-ink text-balance max-w-[10ch]">
              {t("pulse.flow.title")}
            </h2>
          </div>
          <div className="rounded-2xl bg-card/90 backdrop-blur-sm ring-1 ring-line px-3 py-2 text-right">
            <div className="flex items-baseline gap-1 justify-end">
              <span className="font-display text-[34px] leading-none text-aegean-deep tabular-nums tracking-[-0.02em]">
                {hasData ? onTimePct : "—"}
              </span>
              <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft pb-1">
                %
              </span>
            </div>
            <p className="mt-1 font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft">
              {t("pulse.flow.onTime")}
            </p>
          </div>
        </div>
      </div>

      <div className="relative px-6 pb-6 pt-1">
        {/* Proportion bar — late / on-time / early */}
        {hasData ? (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full">
              <span style={{ width: `${latePct}%` }} className="bg-ochre" />
              <span style={{ width: `${onTimePct}%` }} className="bg-aegean-deep" />
              <span style={{ width: `${earlyPct}%` }} className="bg-olive" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <PulseLeg color="ochre" label={t("pulse.flow.late")} pct={latePct} />
              <PulseLeg color="aegean" label={t("pulse.flow.onTime")} pct={onTimePct} />
              <PulseLeg color="olive" label={t("pulse.flow.early")} pct={earlyPct} />
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-limestone-soft ring-1 ring-line px-4 py-3">
            <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink-soft">
              {t("pulse.flow.empty")}
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-ink">
              Buses are between runs. The network wakes back up at first morning departure.
            </p>
          </div>
        )}

        {/* 24h sparkline + activity comb */}
        {buckets.length > 0 && totalToday > 0 && (
          <div className="mt-6">
            <Sparkline buckets={buckets} nowHour={nowHour} />
            <ActivityComb buckets={buckets} nowHour={nowHour} maxCount={maxCount} />
            <div className="mt-2 flex items-baseline justify-between">
              <p className="font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
                {hasData ? (
                  <>
                    <span>{observations.toLocaleString()} live</span>
                    <span className="mx-2 inline-block h-2 w-px translate-y-[1px] bg-line" aria-hidden />
                    <span>{medianMin > 0 ? "+" : ""}{medianMin}m {t("pulse.flow.median").toLowerCase()}</span>
                  </>
                ) : (
                  `${totalToday.toLocaleString()} samples today`
                )}
              </p>
              <p className="font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
                <span>00</span>
                <span className="ml-6">06</span>
                <span className="ml-6">12</span>
                <span className="ml-6">18</span>
                <span className="ml-3 text-ink-soft/60">h</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function PulseLeg({
  color,
  label,
  pct,
}: {
  color: "ochre" | "aegean" | "olive";
  label: string;
  pct: number;
}) {
  const cls =
    color === "ochre" ? "text-ochre" : color === "olive" ? "text-olive" : "text-aegean-deep";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </span>
      <span
        className={`font-sans font-semibold text-[18px] leading-none tabular-nums tracking-[-0.02em] ${cls}`}
      >
        {pct}
        <span className="ml-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          %
        </span>
      </span>
    </div>
  );
}

function ActivityComb({
  buckets,
  nowHour,
  maxCount,
}: {
  buckets: HourBucket[];
  nowHour: number;
  maxCount: number;
}) {
  return (
    <div className="mt-2 flex h-7 items-end gap-[2px]" aria-hidden>
      {buckets.map((b, i) => {
        const h = b.sampleCount === 0 ? 2 : 4 + Math.round((b.sampleCount / maxCount) * 22);
        const isNow = i === nowHour;
        const isEmpty = b.sampleCount === 0;
        return (
          <span
            key={i}
            className={`flex-1 rounded-[2px] ${
              isNow
                ? "bg-ink"
                : isEmpty
                ? "bg-line"
                : "bg-aegean-deep/35"
            }`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

function Sparkline({ buckets, nowHour }: { buckets: HourBucket[]; nowHour: number }) {
  const W = 280;
  const H = 44;
  const pad = 2;
  // Map delay to y, clamped to ±240s
  const yOf = (d: number) => {
    const c = Math.max(-240, Math.min(240, d));
    return H / 2 - (c / 240) * (H / 2 - pad);
  };
  const points = buckets.map((b, i) => {
    const x = pad + (i / (buckets.length - 1 || 1)) * (W - pad * 2);
    const y = b.sampleCount === 0 ? H / 2 : yOf(b.meanDelaySec);
    return { x, y, has: b.sampleCount > 0, h: b.hour };
  });

  // Smooth path via simple polyline (good enough at this size)
  const linePath = points
    .filter((p) => p.has)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(2)}`)
    .join(" ");

  const areaPath = (() => {
    const pts = points.filter((p) => p.has);
    if (pts.length === 0) return "";
    const start = `M${pts[0].x.toFixed(1)} ${H / 2}`;
    const line = pts.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(2)}`).join(" ");
    const end = `L${pts[pts.length - 1].x.toFixed(1)} ${H / 2} Z`;
    return `${start} ${line} ${end}`;
  })();

  const nowPt = points[nowHour];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-11" aria-hidden>
      {/* Zero baseline */}
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--color-ink)" strokeOpacity="0.1" />
      {areaPath && <path d={areaPath} fill="var(--color-aegean-deep)" opacity="0.12" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-aegean-deep)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {nowPt && nowPt.has && (
        <circle cx={nowPt.x} cy={nowPt.y} r="3" fill="var(--color-ink)" />
      )}
    </svg>
  );
}

// Word→category map. Each Greek word in src/data/cyprus-greek-words.json gets a
// motif that fits its meaning, so the illustration changes day-to-day.
type GreekCategory = "greeting" | "courtesy" | "transit" | "food" | "place" | "vibe";
const GREEK_CATEGORY: Record<string, GreekCategory> = {
  "Καλημέρα": "greeting", "Καλησπέρα": "greeting", "Γεια σου": "greeting",
  "Καλώς ήρθες": "greeting", "Καληνύχτα": "greeting",
  "Ευχαριστώ": "courtesy", "Παρακαλώ": "courtesy", "Συγγνώμη": "courtesy",
  "Ναι": "courtesy", "Όχι": "courtesy",
  "Στάση": "transit", "Λεωφορείο": "transit", "Εισιτήριο": "transit", "Ένα λεπτό": "transit",
  "Καφές": "food", "Χαλλούμι": "food", "Σούβλα": "food", "Νόστιμο": "food",
  "Φέρτε μου": "food", "Λογαριασμό": "food", "Στην υγειά σου": "food",
  "Παραλία": "place", "Νερό": "place", "Πού είναι;": "place",
};

function GreekWordGlyph({ word, className }: { word: string; className?: string }) {
  const cat: GreekCategory = GREEK_CATEGORY[word] ?? "vibe";
  const common = {
    viewBox: "0 0 128 128",
    fill: "none" as const,
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true as const,
  };
  const wash = (
    <>
      <defs>
        <radialGradient id={`gw-${cat}`} cx="70%" cy="30%" r="60%">
          <stop offset="0%" stopColor="var(--color-ochre)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--color-ochre)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="128" height="128" fill={`url(#gw-${cat})`} />
    </>
  );

  switch (cat) {
    case "greeting":
      // Sun rising over rolling hills.
      return (
        <svg {...common}>
          {wash}
          <circle cx="86" cy="46" r="18" fill="var(--color-ochre)" opacity="0.85" />
          <circle cx="86" cy="46" r="26" stroke="var(--color-ochre)" strokeWidth="1" fill="none" opacity="0.35" />
          <path d="M0 92 Q32 70 60 86 Q92 104 128 80 L128 128 L0 128 Z" fill="var(--color-olive)" opacity="0.2" />
          <path d="M0 104 Q40 88 76 100 Q104 110 128 96 L128 128 L0 128 Z" fill="var(--color-olive)" opacity="0.55" />
        </svg>
      );

    case "courtesy":
      // Laurel wreath — two opposing arcs of leaves.
      return (
        <svg {...common}>
          {wash}
          {[-1, 1].map((s) => (
            <g key={s} transform={`translate(64 70) scale(${s} 1)`}>
              <path d="M0 -32 Q24 -20 26 0 Q24 22 0 32" stroke="var(--color-olive)" strokeWidth="1.4" fill="none" opacity="0.6" />
              {[-24, -10, 4, 18].map((y, i) => (
                <ellipse key={i} cx="24" cy={y} rx="7" ry="3.2" fill="var(--color-olive)"
                  opacity={0.55 + (i % 2) * 0.2}
                  transform={`rotate(${-30 + i * 18} 24 ${y})`} />
              ))}
            </g>
          ))}
          <circle cx="64" cy="70" r="3" fill="var(--color-olive)" opacity="0.8" />
        </svg>
      );

    case "transit":
      // Stylised bus side-on.
      return (
        <svg {...common}>
          {wash}
          <rect x="20" y="50" width="80" height="38" rx="8" fill="var(--color-aegean-deep)" opacity="0.85" />
          <rect x="26" y="56" width="20" height="14" rx="2" fill="var(--color-card)" opacity="0.9" />
          <rect x="50" y="56" width="20" height="14" rx="2" fill="var(--color-card)" opacity="0.9" />
          <rect x="74" y="56" width="20" height="14" rx="2" fill="var(--color-card)" opacity="0.9" />
          <rect x="20" y="80" width="80" height="3" fill="var(--color-ink)" opacity="0.25" />
          <circle cx="36" cy="92" r="7" fill="var(--color-ink)" opacity="0.85" />
          <circle cx="36" cy="92" r="2.6" fill="var(--color-card)" />
          <circle cx="86" cy="92" r="7" fill="var(--color-ink)" opacity="0.85" />
          <circle cx="86" cy="92" r="2.6" fill="var(--color-card)" />
        </svg>
      );

    case "food":
      // Cyprus coffee cup with rising steam.
      return (
        <svg {...common}>
          {wash}
          <path d="M40 70 L88 70 L84 100 Q84 106 78 106 L50 106 Q44 106 44 100 Z" fill="var(--color-olive)" opacity="0.85" />
          <path d="M88 76 Q102 76 102 86 Q102 96 88 96" stroke="var(--color-olive)" strokeWidth="2.5" fill="none" opacity="0.7" />
          <ellipse cx="64" cy="70" rx="24" ry="4" fill="var(--color-ink)" opacity="0.25" />
          {[52, 64, 76].map((x, i) => (
            <path
              key={i}
              d={`M${x} 60 Q${x + 4} 50 ${x} 40 Q${x - 4} 30 ${x} 22`}
              stroke="var(--color-ink)"
              strokeWidth="1.5"
              fill="none"
              opacity={0.4 - i * 0.08}
              strokeLinecap="round"
            />
          ))}
        </svg>
      );

    case "place":
      // Beach: sun on water with three wave lines.
      return (
        <svg {...common}>
          {wash}
          <circle cx="90" cy="40" r="14" fill="var(--color-ochre)" opacity="0.85" />
          {[64, 78, 92, 106].map((y, i) => (
            <path
              key={y}
              d={`M0 ${y} Q16 ${y - 4} 32 ${y} T64 ${y} T96 ${y} T128 ${y}`}
              stroke="var(--color-aegean-deep)"
              strokeWidth="1.6"
              fill="none"
              opacity={0.7 - i * 0.12}
            />
          ))}
        </svg>
      );

    case "vibe":
    default:
      // Single olive sprig — curved stem with paired leaves and three olives.
      return (
        <svg {...common}>
          {wash}
          <g transform="translate(64 64) rotate(-22)">
            {/* Stem */}
            <path
              d="M-44 36 Q-10 8 38 -32"
              stroke="var(--color-olive)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* Paired leaves along the stem */}
            {[
              { t: 0.15, side: 1 },
              { t: 0.32, side: -1 },
              { t: 0.5, side: 1 },
              { t: 0.68, side: -1 },
              { t: 0.85, side: 1 },
            ].map(({ t, side }, i) => {
              // Quadratic bezier point + tangent
              const p0 = { x: -44, y: 36 };
              const p1 = { x: -10, y: 8 };
              const p2 = { x: 38, y: -32 };
              const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
              const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
              const tx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
              const ty = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
              const ang = (Math.atan2(ty, tx) * 180) / Math.PI + side * 55;
              const lx = x + Math.cos((ang * Math.PI) / 180) * 10;
              const ly = y + Math.sin((ang * Math.PI) / 180) * 10;
              return (
                <ellipse
                  key={i}
                  cx={lx}
                  cy={ly}
                  rx="11"
                  ry="3.6"
                  fill="var(--color-olive)"
                  opacity={0.5 + (i % 2) * 0.25}
                  transform={`rotate(${ang} ${lx} ${ly})`}
                />
              );
            })}
            {/* Olives */}
            <circle cx="-18" cy="14" r="3" fill="var(--color-ink)" opacity="0.65" />
            <circle cx="4" cy="-2" r="3" fill="var(--color-ink)" opacity="0.55" />
            <circle cx="22" cy="-18" r="3" fill="var(--color-ink)" opacity="0.7" />
          </g>
        </svg>
      );
  }
}

// Tap-to-hear Greek pronunciation. Uses Web Speech API with el-GR voice when available.
function SpeakGreekButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
    }
  }, []);

  if (!supported) return null;

  const speak = () => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "el-GR";
      u.rate = 0.85;
      u.pitch = 1;
      const voices = synth.getVoices();
      const greek = voices.find((v) => v.lang?.toLowerCase().startsWith("el"));
      if (greek) u.voice = greek;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.speak(u);
    } catch {
      setSpeaking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Hear ${text} pronounced`}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-olive/12 text-olive transition-all hover:bg-olive/20 active:scale-95 ${
        speaking ? "ring-2 ring-olive/40" : ""
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
        <path
          d="M4 10v4h3l5 4V6L7 10H4Z"
          fill="currentColor"
        />
        <path
          d={speaking ? "M15 9c1.2 1 1.2 5 0 6" : "M15 9c1.2 1 1.2 5 0 6 M17.5 7c2.5 2 2.5 8 0 10"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </button>
  );
}
