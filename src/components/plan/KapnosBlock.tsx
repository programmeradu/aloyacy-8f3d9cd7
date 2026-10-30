// The Kapnos airport-coach card with its "plan the first/last mile" wiring.
// Rendered both when the bus planner found nothing and alongside real
// results, so the behaviour lives here once instead of twice in the route.

import { KapnosShuttleCard } from "@/components/KapnosShuttleCard";
import type { Itinerary } from "@/lib/itinerary-types";
import type { Point } from "@/lib/plan-types";
import type { TripSideQueries } from "./useTripSideQueries";

function scrollToForm() {
  if (typeof document !== "undefined")
    (document.getElementById("app-scroll") ?? window).scrollTo({ top: 0, behavior: "smooth" });
}

export function KapnosBlock({
  extras,
  origin,
  destination,
  onSetOrigin,
  onSetDestination,
  onStartItinerary,
}: {
  extras: TripSideQueries;
  origin: Point | null;
  destination: Point | null;
  onSetOrigin: (p: Point) => void;
  onSetDestination: (p: Point) => void;
  onStartItinerary: (itinerary: Itinerary, from: Point, to: Point) => void;
}) {
  const kapnos = extras.kapnos;
  if (!kapnos) return null;

  const pickup: Point = {
    lat: kapnos.pickup.lat,
    lng: kapnos.pickup.lng,
    label: kapnos.pickup.name,
  };
  const dropoff: Point = {
    lat: kapnos.dropoff.lat,
    lng: kapnos.dropoff.lng,
    label: kapnos.dropoff.name,
  };

  return (
    <KapnosShuttleCard
      suggestion={kapnos}
      firstMile={extras.kapnosFirstMile}
      lastMile={extras.kapnosLastMile}
      firstMileLoading={extras.kapnosFirstMileLoading}
      lastMileLoading={extras.kapnosLastMileLoading}
      onPlanFirstMile={() => {
        // With a planned bus we start it outright; otherwise we retarget the
        // planner at the coach stop so the rider can pick a departure.
        if (extras.kapnosFirstMile && origin) {
          onStartItinerary(extras.kapnosFirstMile, origin, pickup);
          return;
        }
        onSetDestination(pickup);
        scrollToForm();
      }}
      onPlanLastMile={() => {
        if (extras.kapnosLastMile && destination) {
          onStartItinerary(extras.kapnosLastMile, dropoff, destination);
          return;
        }
        onSetOrigin(dropoff);
        scrollToForm();
      }}
    />
  );
}
