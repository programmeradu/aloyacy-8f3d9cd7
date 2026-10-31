// Pulse — live signals section
// Renders every fresh `pulse_signals` row the API gives us, gracefully omitting
// any signal that's missing. Tiles are zone-aware: the sea card only appears
// for coastal zones, cruises only when there's a ship calling at Limassol, etc.
//
// Editorial rules (project memory):
// - Bricolage Grotesque display, Geist sans body. No thin weights.
// - No emoji, no decorative bullets, no generic Lucide icons.
// - Painterly assets, generous negative space, large numerals.

import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { useRoamI18n } from "@/lib/roam-i18n";
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

export function PulseLiveSection({ bundle, locale }: { bundle: PulseLiveBundle; locale: Locale }) {
  const { r } = useRoamI18n();
  const isEl = locale === "el";
  const focusLabel = isEl ? bundle.focus.labelEl : bundle.focus.label;

  // Decide what to render — nothing if absolutely no signals are fresh.
  const hasAny =
    bundle.news ||
    bundle.marine ||
    bundle.air ||
    bundle.metWarnings?.count ||
    bundle.cruises?.count ||
    bundle.flights.length > 0 ||
    bundle.events?.count ||
    bundle.fixtures?.count ||
    bundle.traffic?.count;

  if (!hasAny) return null;

  return (
    <section className="r-pulse-island animate-rise" style={{ animationDelay: "200ms" }}>
      <h2 className="r-pulse-h">
        <span>{r("pulse.island.title")}</span>
      </h2>
      {bundle.metWarnings && bundle.metWarnings.count > 0 && (
        <MetWarningCard payload={bundle.metWarnings} isEl={isEl} />
      )}

      {bundle.news && bundle.news.count > 0 && (
        <NewsRotatorCard payload={bundle.news} isEl={isEl} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {bundle.marine && bundle.focus.coastal && (
          <SeaCard payload={bundle.marine} city={focusLabel} isEl={isEl} />
        )}
        {bundle.flights.length > 0 && <SkyCard payloads={bundle.flights} isEl={isEl} />}
        {bundle.cruises && bundle.cruises.count > 0 && (
          <CruiseCard payload={bundle.cruises} isEl={isEl} />
        )}
        {bundle.air && shouldShowAir(bundle.air) && (
          <AirCard payload={bundle.air} city={focusLabel} isEl={isEl} />
        )}
      </div>

      {bundle.traffic && bundle.traffic.count > 0 && (
        <TrafficCard payload={bundle.traffic} city={focusLabel} isEl={isEl} />
      )}

      {bundle.fixtures && bundle.fixtures.count > 0 && (
        <FixturesStrip payload={bundle.fixtures} isEl={isEl} />
      )}

      {bundle.events && bundle.events.count > 0 && (
        <EventsStrip payload={bundle.events} isEl={isEl} />
      )}
    </section>
  );
}
