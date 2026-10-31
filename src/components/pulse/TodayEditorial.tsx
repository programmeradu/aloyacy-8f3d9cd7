// Cyprus today, in Roam style: one story card (inset painting, headline, lede,
// the editor's note as a soft yellow callout), the day's signals as one list
// card, and two balanced cards for the visitor fact and the Greek word.
// Sentence case throughout, no letter-spaced eyebrows, nothing clipped.

import { kickerCase } from "@/lib/kicker-case";
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

/** Sentence case for a label that may arrive in capitals ("TONIGHT" reads "Tonight"). */
function sentence(s: string): string {
  const k = kickerCase(s);
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : k;
}

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
  const factText = isEl ? briefing.fact.el : briefing.fact.en;
  const factKicker =
    briefing.fact.tag === "local" ? t("today.fact.local") : t("today.fact.tourist");
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

      {briefing.tiles.length > 0 && (
        <>
          <h2 className="r-pulse-h">
            <span>{sentence(t("today.tiles.kicker"))}</span>
          </h2>
          <ul className="r-today-list">
            {briefing.tiles.map((tile, i) => (
              <li key={i} className="r-today-row">
                <span className="r-today-ico" data-accent={tile.accent}>
                  <TodayTileGlyph kind={tile.kind} accent={tile.accent} />
                </span>
                <span className="r-today-rowtxt">
                  <span className="r-today-kick">
                    {sentence(isEl ? tile.kickerEl : tile.kicker)}
                  </span>
                  <span className="r-today-rowtitle">{isEl ? tile.titleEl : tile.title}</span>
                  <span className="r-today-rowsub">{isEl ? tile.detailEl : tile.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="r-today-pair">
        <article className="r-today-card r-today-fact">
          <span className="r-today-kick">{sentence(factKicker)}</span>
          <p className="r-today-facttxt">{factText}</p>
        </article>

        <article className="r-today-card r-today-greek">
          <span className="r-today-greekart" aria-hidden="true">
            <GreekWordGlyph word={briefing.greekWord.el} />
          </span>
          <span className="r-today-kick">{sentence(t("today.greek.kicker"))}</span>
          <div className="r-today-word">
            <b lang="el">{briefing.greekWord.el}</b>
            <SpeakGreekButton text={briefing.greekWord.el} />
          </div>
          <p className="r-today-say">
            <span className="r-today-translit">/{briefing.greekWord.translit}/</span>
            <span className="r-today-means">{briefing.greekWord.en}</span>
          </p>
          <p className="r-today-meaning">{briefing.greekWord.meaning}</p>
        </article>
      </div>
    </section>
  );
}
