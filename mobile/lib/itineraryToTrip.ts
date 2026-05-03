// Convert an `Itinerary` (planner output) into an `ActiveTrip` and seed
// the store so `/trip/[id]` can take over with native turn-by-turn
// guidance. Mirror of `itineraryToJourneyOption` + `startPlannedItinerary`
// in `src/routes/trips.tsx`.

import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { setActiveTrip, pushRecent } from "./trip-store";
import type {
  Itinerary,
  RideLeg,
  WalkLeg,
  JourneyOption,
} from "./journey-types";

export function itineraryToJourneyOption(it: Itinerary): JourneyOption | null {
  const ride = it.legs.find((l): l is RideLeg => l.kind === "ride");
  if (!ride) return null;
  const legs: JourneyOption["legs"] = [];
  for (const leg of it.legs) {
    if (leg.kind === "walk") {
      const w = leg as WalkLeg;
      legs.push({
        kind: "walk",
        from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
        to: { lat: w.to.lat, lng: w.to.lng, label: w.to.name },
        durationSec: w.durationSec,
        distanceMeters: w.distanceMeters,
      });
    } else if (leg.kind === "ride") {
      legs.push({
        kind: "bus",
        routeId: leg.routeId,
        routeShort: leg.routeShort,
        routeLong: leg.routeLong,
        tripId: leg.tripId,
        board: {
          stopId: leg.board.stopId,
          name: leg.board.name,
          departureUnix: leg.board.departureUnix,
        },
        alight: {
          stopId: leg.alight.stopId,
          name: leg.alight.name,
          arrivalUnix: leg.alight.arrivalUnix,
        },
        delaySec: leg.delaySec,
        scheduled: !leg.live,
      });
    }
    // wait legs are dropped — companion derives waiting from board time
  }
  return {
    id: it.id,
    totalDurationSec: it.totalDurationSec,
    departureUnix: it.departureUnix,
    arrivalUnix: it.arrivalUnix,
    legs,
    transfers: it.transfers,
    scheduled: it.source !== "live",
  };
}

export function startItinerary(
  itinerary: Itinerary,
  from: { lat: number; lng: number; label: string },
  to: { lat: number; lng: number; label: string },
) {
  const option = itineraryToJourneyOption(itinerary);
  if (!option) return;
  const rides = itinerary.legs.filter((l): l is RideLeg => l.kind === "ride");
  const isSingleRide = rides.length === 1;
  setActiveTrip({
    startedAt: Date.now(),
    option,
    from,
    to,
    itinerary: isSingleRide ? undefined : itinerary,
    legState: isSingleRide
      ? undefined
      : { currentLegIndex: 0, perLeg: { 0: { enteredAt: Date.now() } } },
  });
  pushRecent({ name: to.label, lat: to.lat, lng: to.lng });
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
  router.push({ pathname: "/trip/[id]", params: { id: option.id } });
}
