// Shared journey/itinerary types used by trip-store and downstream screens.
// Mirror of:
//   - `JourneyOption` / `JourneyLeg` from `src/lib/journey.server.ts`
//   - `Itinerary` family from `@aloya/core/itinerary-types`
//
// Kept in one mobile-local module so we can evolve the shape without
// dragging server modules into the RN bundle. If web mutates these
// shapes, update this file in the same pass.

export type WalkJourneyLeg = {
  kind: "walk";
  from: { lat: number; lng: number; label: string };
  to: { lat: number; lng: number; label: string };
  durationSec: number;
  distanceMeters: number;
};

export type BusJourneyLeg = {
  kind: "bus";
  routeId: string;
  routeShort: string;
  routeLong: string;
  tripId: string;
  board: { stopId: string; name: string; departureUnix: number };
  alight: { stopId: string; name: string; arrivalUnix: number };
  delaySec: number;
  scheduled?: boolean;
};

export type JourneyLeg = WalkJourneyLeg | BusJourneyLeg;

export type JourneyOption = {
  id: string;
  totalDurationSec: number;
  departureUnix: number;
  arrivalUnix: number;
  legs: JourneyLeg[];
  transfers: number;
  scheduled?: boolean;
};

export type {
  Itinerary,
  ItineraryLeg,
  RideLeg,
  WalkLeg,
} from "@aloya/core/itinerary-types";
