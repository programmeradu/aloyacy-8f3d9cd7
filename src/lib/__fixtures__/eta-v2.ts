// Shared stub data for the smartEtaV2 suites. The stop table lets each spec
// control the geometry without touching the bundled GTFS dataset.
import type { LiveArrival, LiveVehicle } from "../gtfs-rt.server";

export const NOW = 1_700_000_000;

/** A north-running ladder of stops ~1.1 km apart. */
export const STOPS: Record<string, { lat: number; lng: number }> = {
  A: { lat: 35.0, lng: 33.0 },
  B: { lat: 35.01, lng: 33.0 },
  C: { lat: 35.02, lng: 33.0 },
  D: { lat: 35.03, lng: 33.0 },
  E: { lat: 35.04, lng: 33.0 },
  F: { lat: 35.05, lng: 33.0 },
  G: { lat: 35.06, lng: 33.0 },
  H: { lat: 35.07, lng: 33.0 },
};

export function arrival(overrides: Partial<LiveArrival>): LiveArrival {
  return {
    stopId: "B",
    routeId: "R1",
    tripId: "T1",
    arrivalUnix: NOW + 300,
    delaySec: 0,
    ...overrides,
  };
}

export function vehicle(overrides: Partial<LiveVehicle>): LiveVehicle {
  return {
    id: "V1",
    routeId: "R1",
    tripId: "T1",
    lat: 35.0,
    lng: 33.0,
    bearing: 0,
    speed: 10,
    label: "1",
    timestamp: NOW,
    ...overrides,
  };
}
