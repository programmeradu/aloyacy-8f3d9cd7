// Cyprus today, in Roam style, split into the pieces the Pulse board places
// apart: the story card (the hero), the fun pair (Greek word and Did you know,
// side by side at equal height) and the day's signals list (On the island right
// now). Sentence case throughout, no letter-spaced eyebrows, nothing clipped.

import type { ReactNode } from "react";
import { kickerCase } from "@/lib/kicker-case";
import { TodayTileGlyph } from "@/components/TodayTileGlyph";
import { SpeakGreekButton } from "@/components/pulse/SpeakGreekButton";
import { greekWordArt, greekWordAudio, greekWordSize } from "@/components/pulse/greek-word-art";
import type { TodayBriefing, TodayTheme } from "@/lib/today.functions";
import type { DictKey } from "@/lib/i18n";
import todayDerby from "@/assets/today-derby.jpg";
import todayHeatwave from "@/assets/today-heatwave.jpg";
import todayCruise from "@/assets/today-cruise.jpg";
import todayFestival from "@/assets/today-festival.jpg";
import todayStorm from "@/assets/today-storm.jpg";
import todayCalm from "@/assets/today-calm.jpg";
import pulseFact from "@/assets/pulse-fact.webp";

export type Translate = (k: DictKey, vars?: Record<string, string | number>) => string;

type Tile = TodayBriefing["tiles"][number];

const THEME_HERO: Record<TodayTheme, string> = {
  derby: todayDerby,
  heatwave: todayHeatwave,
  cruise: todayCruise,
  festival: todayFestival,
  storm: todayStorm,
  holiday: todayCalm,
  calm: todayCalm,
};

// Rows that name a place or an occasion get a painted thumbnail; weather, name
// day and rhythm rows keep their drawn glyphs.
const TILE_ART: Partial<Record<string, string>> = {
  match: todayDerby,
  festival: todayFestival,
  cruise: todayCruise,
  holiday: todayCalm,
};

/** Sentence case for a label that may arrive in capitals ("TONIGHT" reads "Tonight"). */
function sentence(s: string): string {
  const k = kickerCase(s);
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : k;
}

type Props = { briefing: TodayBriefing; locale: "en" | "el"; t: Translate };

export function TodayStory({ briefing, locale, t }: Props) {
  const isEl = locale === "el";
  const hero = THEME_HERO[briefing.heroKey] ?? todayCalm;
  const headline = isEl ? briefing.headline.el : briefing.headline.en;
  const lede = isEl ? briefing.lede.el : briefing.lede.en;
  const verdict = isEl ? briefing.verdict.el : briefing.verdict.en;
  const focus =
    briefing.focus.scope === "island"
      ? null
      : briefing.focus.scope === "trip"
        ? isEl
          ? `Προς ${briefing.focus.cityEl}`
          : `Heading to ${briefing.focus.city}`
        : isEl
          ? `Στη ${briefing.focus.cityEl}`
          : `Around ${briefing.focus.city}`;

  return (
    <section className="r-today animate-rise">
      <h2 className="r-pulse-h r-pulse-h--first">
        <span>{sentence(t("today.kicker"))}</span>
        {focus ? <small>{focus}</small> : null}
      </h2>
      <article className="r-today-story">
        <div className="r-today-art">
          <img src={hero} alt="" aria-hidden="true" decoding="async" />
        </div>
        <div className="r-today-body">
          <h3 className="r-today-head">{headline}</h3>
          <p className="r-today-lede">{lede}</p>
          {verdict ? (
            <div className="r-today-note">
              <span className="r-today-notelbl">{sentence(t("today.verdict.kicker"))}</span>
              <p>{verdict}</p>
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}

/** Greek word and Did you know: two half-width cards of equal height. */
export function TodayPair({ briefing, locale, t }: Props) {
  const isEl = locale === "el";
  const w = briefing.greekWord;
  const voice = greekWordAudio(w.el);
  const factText = isEl ? briefing.fact.el : briefing.fact.en;
  const factKicker =
    briefing.fact.tag === "local" ? t("today.fact.local") : t("today.fact.tourist");

  return (
    <div className="r-today-pair animate-rise" style={{ animationDelay: "60ms" }}>
      <article className="r-today-card r-today-greek" data-wotd={w.el}>
        <div className="r-pair-art">
          <img
            src={greekWordArt(w.el)}
            alt=""
            aria-hidden="true"
            decoding="async"
            width={320}
            height={320}
          />
          {voice ? (
            <span className="r-pair-speak">
              <SpeakGreekButton text={w.el} src={voice} />
            </span>
          ) : null}
        </div>
        <div className="r-pair-body">
          <span className="r-today-kick">{sentence(t("today.greek.kicker"))}</span>
          <b className="r-greek-word" lang="el" data-size={greekWordSize(w.el)}>
            {w.el}
          </b>
          <p className="r-greek-say">
            <span>/{w.translit}/</span> <b>{w.en}</b>
          </p>
          <p className="r-greek-meaning">{w.meaning}</p>
        </div>
      </article>

      <article className="r-today-card r-today-fact">
        <div className="r-pair-art">
          <img src={pulseFact} alt="" aria-hidden="true" decoding="async" width={640} height={467} />
        </div>
        <div className="r-pair-body">
          <span className="r-today-kick">{sentence(factKicker)}</span>
          <p className="r-fact-txt">{factText}</p>
        </div>
      </article>
    </div>
  );
}

/** On the island right now: warnings first, the day's signals, then traffic. */
export function TodayIsland({
  tiles,
  isEl,
  t,
  before,
  after,
}: {
  tiles: Tile[];
  isEl: boolean;
  t: Translate;
  before?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <section className="r-pulse-sec animate-rise">
      <h2 className="r-pulse-h">
        <span>{sentence(t("today.tiles.kicker"))}</span>
      </h2>
      <div className="r-pulse-stack">
        {before}
        {tiles.length > 0 && (
          <ul className="r-today-list">
            {tiles.map((tile, i) => {
              const art = TILE_ART[tile.kind];
              return (
                <li key={i} className="r-today-row">
                  <span
                    className={art ? "r-today-ico r-today-ico--art" : "r-today-ico"}
                    data-accent={tile.accent}
                  >
                    {art ? (
                      <img src={art} alt="" aria-hidden="true" loading="lazy" decoding="async" />
                    ) : (
                      <TodayTileGlyph kind={tile.kind} accent={tile.accent} />
                    )}
                  </span>
                  <span className="r-today-rowtxt">
                    <span className="r-today-kick">
                      {sentence(isEl ? tile.kickerEl : tile.kicker)}
                    </span>
                    <span className="r-today-rowtitle">{isEl ? tile.titleEl : tile.title}</span>
                    <span className="r-today-rowsub">{isEl ? tile.detailEl : tile.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {after}
      </div>
    </section>
  );
}
