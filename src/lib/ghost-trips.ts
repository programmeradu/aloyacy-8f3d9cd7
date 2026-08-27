// Ghost tagging — the one place a trip is labelled "no fresh vehicle".
//
// The freshness classifier is agency-aware (urban 180 s / Intercity 300 s).
// Snapshot tagging used to be a flat 180 s, so an IC coach 4 minutes dark
// was a ghost here and "predicted" on the stop card. Same-number rule:
// both layers read `thresholdsFor(agency).ghost`.

import { thresholdsFor, type Agency } from "./freshness";

export type GhostArrival = {
  tripId: string;
  routeId: string;
  arrivalUnix: number;
};

export type GhostVehicle = {
  tripId: string;
  routeId: string;
  timestamp: number;
};

const SOON_WINDOW_SEC = 30 * 60;

export function ghostCutoffSec(agency: Agency): number {
  return thresholdsFor(agency).ghost;
}

/**
 * Trip IDs with an upcoming arrival and no fresh vehicle (or none at all).
 * Rider-confirmed trips are excluded — a sighting is stronger than a stale ping.
 */
export function tagGhostTripIds(input: {
  now: number;
  arrivals: GhostArrival[];
  vehicles: GhostVehicle[];
  confirmedTripIds: Iterable<string>;
  agencyForRoute: (routeId: string) => Agency;
}): string[] {
  const confirmed = new Set(input.confirmedTripIds);
  const byTrip = new Map(input.vehicles.map((v) => [v.tripId, v]));
  const tripsWithUpcoming = new Set<string>();
  const routeByTrip = new Map<string, string>();

  for (const a of input.arrivals) {
    if (a.arrivalUnix >= input.now - 30 && a.arrivalUnix <= input.now + SOON_WINDOW_SEC) {
      tripsWithUpcoming.add(a.tripId);
      if (a.routeId) routeByTrip.set(a.tripId, a.routeId);
    }
  }

  const ghosts: string[] = [];
  for (const tripId of tripsWithUpcoming) {
    if (confirmed.has(tripId)) continue;
    const v = byTrip.get(tripId);
    if (!v) {
      ghosts.push(tripId);
      continue;
    }
    const routeId = v.routeId || routeByTrip.get(tripId);
    const cutoff = ghostCutoffSec(input.agencyForRoute(routeId ?? ""));
    if (v.timestamp && input.now - v.timestamp >= cutoff) {
      ghosts.push(tripId);
    }
  }
  return ghosts;
}
