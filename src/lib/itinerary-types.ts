// Shared, client-safe types for multi-leg itineraries.
// These DTOs cross the server→client boundary, so keep them plain
// (no Map, Set, Date, class instances, or non-serialisable values).

export type RideLeg = {
  kind: "ride";
  routeId: string;
  routeShort: string;
  routeLong: string;
  tripId: string;
  /** True when this trip came from the live feed, false when estimated. */
  live: boolean;
  board: {
    stopId: string;
    name: string;
    lat: number;
    lng: number;
    departureUnix: number;
  };
  alight: {
    stopId: string;
    name: string;
    lat: number;
    lng: number;
    arrivalUnix: number;
  };
  /** Number of stops between board and alight (inclusive of alight, excludes board). */
  stopCount: number;
  /** Best-known delay at board time, in seconds. 0 for scheduled-only. */
  delaySec: number;
};

export type WalkLeg = {
  kind: "walk";
  from: { stopId?: string; name: string; lat: number; lng: number };
  to: { stopId?: string; name: string; lat: number; lng: number };
  /** Seconds, derived from real path when verified=true, straight-line × 1.35 otherwise. */
  durationSec: number;
  distanceMeters: number;
  /** True when geometry came from Google Directions, false for fallback. */
  verified: boolean;
  /** Encoded polyline for map rendering; empty when fallback. */
  polyline?: string;
};

export type WaitLeg = {
  kind: "wait";
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  /** Seconds spent waiting between arriving and the next ride departing. */
  durationSec: number;
};

export type Leg = RideLeg | WalkLeg | WaitLeg;

export type Itinerary = {
  id: string;
  legs: Leg[];
  /** Computed from legs: now → final arrival, in seconds. */
  totalDurationSec: number;
  /** First leg start (typically the access walk start). */
  departureUnix: number;
  /** Last leg end (the egress walk end). */
  arrivalUnix: number;
  /** Number of ride legs minus 1, i.e. number of changes. */
  transfers: number;
  /** Total walking across the whole itinerary, in meters. */
  totalWalkMeters: number;
  /** Lower = better. Used for ranking; explained inline at the call site. */
  score: number;
  /** Diagnostic: where the times came from. */
  source: "live" | "mixed" | "estimated";
};
