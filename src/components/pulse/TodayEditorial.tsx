// Cyprus Today — the editorial hero, the contextual tiles, the verdict pull
// quote, the local/tourist fact and the Greek word of the day.

import { kickerCase } from "@/lib/kicker-case";
import { briefingDateLabel } from "@aloya/core/greek-word-motif";
import { TodayTileGlyph } from "@/components/TodayTileGlyph";
import { GreekWordGlyph } from "@/components/pulse/GreekWordGlyph";
import { SpeakGreekButton } from "@/components/pulse/SpeakGreekButton";
import type { TodayBriefing, TodayTheme } from "@/lib/today.functions";
import type { DictKey } from "@/lib/i18n";
import todayDerby from "@/assets/today-derby.jpg";
import todayHeatwave from "@/assets/today-heatwave.jpg";
import todayCruise from "@/assets/today-cruise.jpg";
import todayFestival from "@/assets/today-festival.jpg";
import todayStorm from "@/assets/today-storm.jpg";
import todayCalm from "@/assets/today-calm.jpg";

export type Translate = (k: DictKey, vars?: Record<string, string | number>) => string;

const THEME_HERO: Record<TodayTheme, string> = {
  derby: todayDerby,
  heatwave: todayHeatwave,
  cruise: todayCruise,
  festival: todayFestival,
  storm: todayStorm,
  holiday: todayCalm,
  calm: todayCalm,
};

export function TodayEditorial({
  briefing,
  locale,
  t,
}: {
  briefing: TodayBriefing;
  locale: "en" | "el";
  t: Translate;
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
  const niceDate = briefingDateLabel(briefing.date, weekday, locale);

  return (
    <section className="animate-rise">
      <h2 className="r-pulse-h r-pulse-h--first">{t("today.kicker")}</h2>

      {/* Hero card */}
      <article className="relative overflow-hidden rounded-[28px] bg-card ring-1 ring-line r-pulse-story">
        <div className="relative m-2 aspect-[16/10] overflow-hidden rounded-[22px]">
          <img
            src={hero}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover select-none"
          />
          <div
            aria-hidden
            className="hidden"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 30%, transparent) 55%, var(--color-card) 100%)",
            }}
          />
          <div className="absolute left-3 top-3 right-3 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-sm px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink ring-1 ring-line">
              {niceDate}
            </p>
            {briefing.focus.scope !== "island" && (
              <p className="inline-flex items-center rounded-full bg-ink/85 backdrop-blur-sm px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-card ring-1 ring-ink/40">
                {briefing.focus.scope === "trip"
                  ? isEl
                    ? `Προς ${briefing.focus.cityEl}`
                    : `Heading to ${briefing.focus.city}`
                  : isEl
                    ? `Στη ${briefing.focus.cityEl}`
                    : `Around ${briefing.focus.city}`}
              </p>
            )}
          </div>
        </div>

        <div className="relative px-4 pt-2 pb-5">
          <h2 className="font-display text-[26px] leading-[1.12] text-ink text-balance">
            {headline}
          </h2>
          <p className="mt-2 text-[15px] leading-[1.45] text-ink-soft text-pretty">{lede}</p>
        </div>
      </article>

      {/* Tiles */}
      {briefing.tiles.length > 0 && (
        <div className=""><h2 className="r-pulse-h">{t("today.tiles.kicker")}</h2>
          <div className="grid gap-3">
            {briefing.tiles.map((tile, i) => (
              <TodayTileCard key={i} tile={tile} isEl={isEl} />
            ))}
          </div>
        </div>
      )}

      {/* Verdict */}
      <div className="relative mt-6 overflow-hidden rounded-[26px] bg-card px-5 py-5">
        <span
          aria-hidden
          className="absolute -top-3 left-4 font-display text-[72px] leading-none text-[#F6B83C]/40 select-none"
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
        <GreekWordGlyph
          word={briefing.greekWord.el}
          className="pointer-events-none absolute -right-3 -top-3 h-32 w-32"
        />
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
          <p className="mt-2 font-display text-[15px] text-olive">{briefing.greekWord.en}</p>
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
          {kickerCase(isEl ? tile.kickerEl : tile.kicker)}
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
