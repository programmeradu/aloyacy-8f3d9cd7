// Shared itinerary builders for the multi-leg journey suites. Kept out of the
// spec files so each suite stays focused and under the repo's line ceiling.
import type { Leg, RideLeg, WalkLeg, WaitLeg } from "../itinerary-types";

export const NIC = { lat: 35.1717, lng: 33.3642 };

export function walk(over: Partial<WalkLeg> = {}): WalkLeg {
  return {
    kind: "walk",
    from: { name: "Home", lat: NIC.lat, lng: NIC.lng },
    to: { name: "Stop A", lat: NIC.lat + 0.005, lng: NIC.lng },
    durationSec: 300,
    distanceMeters: 400,
    verified: true,
    ...over,
  };
}

export function ride(over: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "R1",
    routeShort: "150",
    routeLong: "Nicosia · Larnaca",
    tripId: "T1",
    live: true,
    board: { stopId: "A", name: "Stop A", lat: NIC.lat + 0.005, lng: NIC.lng, departureUnix: 1000 },
    alight: { stopId: "B", name: "Stop B", lat: NIC.lat + 0.05, lng: NIC.lng, arrivalUnix: 2000 },
    stopCount: 8,
    delaySec: 0,
    ...over,
  };
}

export function wait(over: Partial<WaitLeg> = {}): WaitLeg {
  return {
    kind: "wait",
    stopId: "B",
    name: "Stop B",
    lat: NIC.lat + 0.05,
    lng: NIC.lng,
    durationSec: 240,
    ...over,
  };
}

/** walk → ride → walk → wait → ride → walk */
export function twoRideItinerary(): Leg[] {
  return [
    walk(),
    ride(),
    walk({
      from: { name: "Stop B", lat: NIC.lat + 0.05, lng: NIC.lng },
      to: { name: "Stop C", lat: NIC.lat + 0.051, lng: NIC.lng },
    }),
    wait(),
    ride({
      tripId: "T2",
      routeShort: "200",
      board: {
        stopId: "C",
        name: "Stop C",
        lat: NIC.lat + 0.051,
        lng: NIC.lng,
        departureUnix: 3000,
      },
      alight: {
        stopId: "D",
        name: "Stop D",
        lat: NIC.lat + 0.09,
        lng: NIC.lng,
        arrivalUnix: 4000,
      },
    }),
    walk({
      from: { name: "Stop D", lat: NIC.lat + 0.09, lng: NIC.lng },
      to: { name: "Office", lat: NIC.lat + 0.091, lng: NIC.lng },
    }),
  ];
}
