import { useNavigate } from "@tanstack/react-router";
import { ItineraryCard } from "@/components/ItineraryCard";
import { RemindMeButton } from "@/components/RemindMeButton";
import { SharePlanButton } from "@/components/SharePlanButton";
import { useI18n } from "@/lib/i18n";
import type { Itinerary } from "@/lib/itinerary-types";
import { isSingleRide, itineraryToJourneyOption, splitItineraries } from "@/lib/plan-bridge";
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
      <div className="px-1 flex flex-wrap items-center gap-2">
        <RemindMeButton itinerary={itinerary} origin={origin} destination={destination} />
        <SharePlanButton itinerary={itinerary} origin={origin} destination={destination} />
      </div>
    </div>
  );
}

/**
 * Renders direct trips first, then any trips that need a transfer.
 */
export function ItineraryResults({
  results,
  origin,
  destination,
}: {
  results: Itinerary[];
  origin: Point;
  destination: Point;
}) {
  const { t } = useI18n();
  const { direct, transfers } = splitItineraries(results);

  return (
    <div className="flex flex-col gap-3">
      {direct.map((it, i) => (
        <ItineraryRow
          key={`${it.id}-direct-${it.departureUnix}-${i}`}
          itinerary={it}
          highlight={i === 0 && direct.length > 0}
          origin={origin}
          destination={destination}
        />
      ))}
      {transfers.map((it, i) => (
        <ItineraryRow
          key={`${it.id}-transfer-${it.departureUnix}-${i}`}
          itinerary={it}
          highlight={direct.length === 0 && i === 0}
          origin={origin}
          destination={destination}
        />
      ))}
    </div>
  );
}
