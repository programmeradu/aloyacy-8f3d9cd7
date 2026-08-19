import { describe, expect, it } from "vitest";
import type { ActiveTrip } from "@/lib/trip-store";
import type { Leg } from "@/lib/itinerary-types";
import {
  LAST_MILE_MIN_WALK_METERS,
  finalWalkLeg,
  shouldChainLastMile,
} from "@/lib/useLastMileChain";

function walkLeg(distanceMeters: number): Leg {
  return {
    kind: "walk",
    from: { stopId: "s1", name: "Stop A", lat: 34.8, lng: 33.5 },
    to: { name: "Destination", lat: 34.9, lng: 33.6 },
    durationSec: Math.round(distanceMeters / 1.4),
    distanceMeters,
    verified: true,
  };
}

function rideLeg(): Leg {
  return {
    kind: "ride",
    routeId: "30",
    routeShort: "30",
    routeLong: "Limassol - Larnaca",
    tripId: "trip-1",
    live: false,
    board: { stopId: "b1", name: "Board", lat: 34.7, lng: 33.0, departureUnix: 1787000000 },
    alight: { stopId: "a1", name: "Alight", lat: 34.8, lng: 33.5, arrivalUnix: 1787003000 },
    stopCount: 12,
    delaySec: 0,
  };
}

function trip(legs: Leg[] | undefined): ActiveTrip {
  const base: ActiveTrip = {
    startedAt: Date.now(),
    option: {
      id: "trip-123",
      totalDurationSec: 2700,
      departureUnix: 1787000000,
      arrivalUnix: 1787002700,
      legs: [],
      transfers: 0,
    },
    from: { lat: 34.7, lng: 33.0, label: "Limassol" },
    to: { lat: 34.9, lng: 33.6, label: "Larnaca" },
  };
  if (!legs) return base;
  return {
    ...base,
    itinerary: {
      id: "itin-1",
      legs,
      totalDurationSec: 3600,
      departureUnix: 1787000000,
      arrivalUnix: 1787003600,
      transfers: 0,
      totalWalkMeters: legs.reduce((m, l) => m + (l.kind === "walk" ? l.distanceMeters : 0), 0),
      score: 1,
      source: "estimated",
    },
  };
}

describe("last-mile chain eligibility", () => {
  it("returns the final leg when it is a walk", () => {
    expect(finalWalkLeg(trip([rideLeg(), walkLeg(1200)]))?.distanceMeters).toBe(1200);
  });

  it("returns null when the trip ends on a ride", () => {
    expect(finalWalkLeg(trip([walkLeg(300), rideLeg()]))).toBeNull();
  });

  it("returns null with no itinerary or no legs", () => {
    expect(finalWalkLeg(trip(undefined))).toBeNull();
    expect(finalWalkLeg(trip([]))).toBeNull();
  });

  it("chains a long final walk", () => {
    expect(shouldChainLastMile(trip([rideLeg(), walkLeg(1200)]))).toBe(true);
  });

  it("ignores a short final walk", () => {
    expect(shouldChainLastMile(trip([rideLeg(), walkLeg(400)]))).toBe(false);
  });

  it("treats the threshold itself as eligible", () => {
    expect(shouldChainLastMile(trip([rideLeg(), walkLeg(LAST_MILE_MIN_WALK_METERS)]))).toBe(true);
    expect(shouldChainLastMile(trip([rideLeg(), walkLeg(LAST_MILE_MIN_WALK_METERS - 1)]))).toBe(
      false,
    );
  });
});
