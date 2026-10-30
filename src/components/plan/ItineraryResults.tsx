import { useNavigate } from "@tanstack/react-router";
import { ItineraryCard } from "@/components/ItineraryCard";
import { RemindMeButton } from "@/components/RemindMeButton";
import { SharePlanButton } from "@/components/SharePlanButton";
import { useI18n } from "@/lib/i18n";
import type { Itinerary } from "@/lib/itinerary-types";
import { isSingleRide, itineraryToJourneyOption } from "@/lib/plan-bridge";
import { sortItineraries, type ResultSort } from "./sort-itineraries";

export type { ResultSort };
import type { Point } from "@/lib/plan-types";
import { setActiveTrip } from "@/lib/trip-store";

/**
 * Renders an Itinerary card and wires "Start this trip" to the companion:
 * single-ride trips go through the legacy JourneyOption path, multi-ride
 * trips additionally carry the itinerary + leg state for MultiLegCompanion.
 */
function ItineraryRow({
  itinerary,
  highlight,
  origin,
  destination,
}: {
  itinerary: Itinerary;
  highlight: boolean;
  origin: Point;
  destination: Point;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const single = isSingleRide(itinerary);

  function start() {
    const option = itineraryToJourneyOption(itinerary);
    if (!option) return;
    setActiveTrip({
      startedAt: Date.now(),
      option,
      from: origin,
      to: destination,
      itinerary: single ? undefined : itinerary,
      legState: single
        ? undefined
        : { currentLegIndex: 0, perLeg: { 0: { enteredAt: Date.now() } } },
    });
    void navigate({ to: "/trip/$id", params: { id: option.id } });
  }

  return (
    <div className="flex flex-col gap-2">
      <ItineraryCard
        itinerary={itinerary}
        highlight={highlight}
        onStart={start}
        startLabel={t("trips.startThis")}
      />
      <div className="r-legacy px-1 flex flex-wrap items-center gap-2">
        <RemindMeButton itinerary={itinerary} origin={origin} destination={destination} />
        <SharePlanButton itinerary={itinerary} origin={origin} destination={destination} />
      </div>
    </div>
  );
}

export function ItineraryResults({
  results,
  origin,
  destination,
  sort = "rec",
}: {
  results: Itinerary[];
  origin: Point;
  destination: Point;
  sort?: ResultSort;
}) {
  const ordered = sortItineraries(results, sort);
  return (
    <div className="flex flex-col gap-4">
      {ordered.map((it, i) => (
        <ItineraryRow
          key={`${it.id}-${it.departureUnix}-${i}`}
          itinerary={it}
          highlight={i === 0}
          origin={origin}
          destination={destination}
        />
      ))}
    </div>
  );
}
