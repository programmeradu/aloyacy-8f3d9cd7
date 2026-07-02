// Synthesize an ActiveTrip from a picked Kapnos coach departure so we can
// hand the rider off to the live Trip Companion. The coach ride becomes
// the middle "bus" leg with routeShort "K", framed by walk legs only when
// the pickup / dropoff stop is actually within a sensible walk. If it's
// far (>1.2 km), we omit the walk stub — telling a rider to "walk straight
// 20 km" is worse than useless — and rely on the first-/last-mile bus plan
// surfaced on the shuttle card instead.

import { WALK_M_PER_S } from "@aloya/core/geo";
import type { KapnosDeparture, KapnosSuggestion } from "./kapnos";
import { setActiveTrip, type ActiveTrip } from "./trip-store";
import type { BusJourneyLeg, JourneyOption, WalkJourneyLeg } from "./journey-types";

const WALKABLE_M = 1_200;

function walkSecs(distanceM: number): number {
  return Math.max(30, Math.round(distanceM / WALK_M_PER_S));
}

function parseLocalUnix(local: string): number {
  // Kapnos local time is "YYYY-MM-DD HH:mm" in Asia/Nicosia. Interpret as
  // that timezone by appending "+03:00" (Cyprus is UTC+2/+3; this is a
  // best-effort — the departure copy is derived from the same string).
  const iso = local.replace(" ", "T") + ":00+03:00";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000);
}

export function startKapnosCompanion(
  suggestion: KapnosSuggestion,
  departure: KapnosDeparture,
): void {
  const boardUnix = parseLocalUnix(departure.departLocal);
  const alightUnix = parseLocalUnix(departure.arriveLocal);

  const pickupWalkable = suggestion.pickup.distanceM <= WALKABLE_M;
  const dropoffWalkable = suggestion.dropoff.distanceM <= WALKABLE_M;
  const walkInSec = pickupWalkable ? walkSecs(suggestion.pickup.distanceM) : 0;
  const walkOutSec = dropoffWalkable ? walkSecs(suggestion.dropoff.distanceM) : 0;

  const legs: (WalkJourneyLeg | BusJourneyLeg)[] = [];

  if (pickupWalkable) {
    legs.push({
      kind: "walk",
      from: {
        lat: suggestion.pickup.lat,
        lng: suggestion.pickup.lng,
        label: "Start",
      },
      to: {
        lat: suggestion.pickup.lat,
        lng: suggestion.pickup.lng,
        label: suggestion.pickup.name,
      },
      durationSec: walkInSec,
      distanceMeters: Math.round(suggestion.pickup.distanceM),
    });
  }

  const coach: BusJourneyLeg = {
    kind: "bus",
    routeId: suggestion.routeId,
    routeShort: "K",
    routeLong: `Kapnos ${suggestion.routeName}`,
    tripId: `kapnos-${departure.tripId}`,
    board: {
      stopId: `kapnos-${suggestion.routeId}-pickup`,
      name: suggestion.pickup.name,
      departureUnix: boardUnix,
    },
    alight: {
      stopId: `kapnos-${suggestion.routeId}-dropoff`,
      name: suggestion.dropoff.name,
      arrivalUnix: alightUnix,
    },
    delaySec: 0,
    scheduled: true,
  };
  legs.push(coach);

  if (dropoffWalkable) {
    legs.push({
      kind: "walk",
      from: {
        lat: suggestion.dropoff.lat,
        lng: suggestion.dropoff.lng,
        label: suggestion.dropoff.name,
      },
      to: {
        lat: suggestion.dropoff.lat,
        lng: suggestion.dropoff.lng,
        label: "Destination",
      },
      durationSec: walkOutSec,
      distanceMeters: Math.round(suggestion.dropoff.distanceM),
    });
  }

  const option: JourneyOption = {
    id: `kapnos-${departure.tripId}`,
    totalDurationSec: walkInSec + Math.max(0, alightUnix - boardUnix) + walkOutSec,
    departureUnix: boardUnix - walkInSec,
    arrivalUnix: alightUnix + walkOutSec,
    legs,
    transfers: 0,
    scheduled: true,
  };

  const trip: ActiveTrip = {
    startedAt: Date.now(),
    option,
    from: {
      lat: suggestion.pickup.lat,
      lng: suggestion.pickup.lng,
      label: suggestion.pickup.name,
    },
    to: {
      lat: suggestion.dropoff.lat,
      lng: suggestion.dropoff.lng,
      label: suggestion.dropoff.name,
    },
    live: { startedAt: Date.now() },
  };

  setActiveTrip(trip);
}
