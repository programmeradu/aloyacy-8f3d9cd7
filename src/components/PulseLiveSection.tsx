// Pulse live signals, split into the pieces the Pulse board places apart:
// warnings and traffic join On the island right now, news, events and football
// sit together, and the rarer signals (cruise, sea, flights, air) come last.
// Each piece renders nothing when its signal is missing, so no heading stands
// alone. Sentence case, no letter-spaced labels, no dashes or middle dots.

import type { ReactNode } from "react";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { shouldShowAir, type Locale } from "./pulse-live/shared";
import {
  AirCard,
  CruiseCard,
  MetWarningCard,
  NewsRotatorCard,
  SeaCard,
  SkyCard,
} from "./pulse-live/cards";
import { FixturesStrip } from "./pulse-live/FixturesStrip";
import { EventsStrip } from "./pulse-live/EventsStrip";
import { TrafficCard } from "./pulse-live/TrafficCard";

type Props = { bundle: PulseLiveBundle; locale: Locale };

export const hasWarnings = (b: PulseLiveBundle) =>
  (b.metWarnings?.count ?? 0) > 0 && !!b.metWarnings?.warnings[0];
export const hasTraffic = (b: PulseLiveBundle) =>
  (b.traffic?.count ?? 0) > 0 && !!b.traffic?.incidents[0];

export function PulseWarnings({ bundle, locale }: Props) {
  if (!bundle.metWarnings || !hasWarnings(bundle)) return null;
  return <MetWarningCard payload={bundle.metWarnings} isEl={locale === "el"} />;
}

export function PulseTraffic({ bundle, locale }: Props) {
  if (!bundle.traffic || !hasTraffic(bundle)) return null;
  const isEl = locale === "el";
  return (
    <TrafficCard
      payload={bundle.traffic}
      city={isEl ? bundle.focus.labelEl : bundle.focus.label}
      isEl={isEl}
    />
  );
}

/** News, then what is on today, then football. */
export function PulseHappening({ bundle, locale }: Props) {
  const isEl = locale === "el";
  const news = bundle.news && bundle.news.count > 0 ? bundle.news : null;
  return (
    <>
      {news && (
        <section className="r-pulse-sec animate-rise">
          <h2 className="r-pulse-h">
            <span>{isEl ? "Στις ειδήσεις" : "In the news"}</span>
          </h2>
          <NewsRotatorCard payload={news} isEl={isEl} />
        </section>
      )}
      {bundle.events && bundle.events.count > 0 && (
        <EventsStrip payload={bundle.events} isEl={isEl} />
      )}
      {bundle.fixtures && bundle.fixtures.count > 0 && (
        <FixturesStrip payload={bundle.fixtures} isEl={isEl} />
      )}
    </>
  );
}

/** The rarer signals: the cruise card full width, then sea, flights and air as halves. */
export function PulseRare({ bundle, locale }: Props) {
  const isEl = locale === "el";
  const city = isEl ? bundle.focus.labelEl : bundle.focus.label;
  const halves: ReactNode[] = [];
  if (bundle.marine && bundle.focus.coastal)
    halves.push(<SeaCard key="sea" payload={bundle.marine} city={city} isEl={isEl} />);
  if (bundle.flights.length > 0)
    halves.push(<SkyCard key="sky" payloads={bundle.flights} isEl={isEl} />);
  if (bundle.air && shouldShowAir(bundle.air))
    halves.push(<AirCard key="air" payload={bundle.air} city={city} isEl={isEl} />);
  const cruise = bundle.cruises && bundle.cruises.count > 0 ? bundle.cruises : null;
  if (!cruise && halves.length === 0) return null;

  return (
    <section className="r-pulse-sec animate-rise">
      <h2 className="r-pulse-h">
        <span>{isEl ? "Θάλασσα, ουρανός και αέρας" : "Sea, sky and air"}</span>
      </h2>
      <div className="r-pulse-stack">
        {cruise && <CruiseCard payload={cruise} isEl={isEl} />}
        {halves.length > 0 && (
          <div className="r-pc-pair" data-n={halves.length}>
            {halves}
          </div>
        )}
      </div>
    </section>
  );
}
