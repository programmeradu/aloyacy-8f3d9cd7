import { describe, it, expect, beforeEach } from "vitest";
import { itineraryToJourneyOption, startItinerary } from "../itineraryToTrip";
import { getActiveTrip } from "../trip-store";
import { router, __resetRouter } from "../../test/stubs/expo-router";
import { __hapticEvents, __resetHaptics } from "../../test/stubs/expo-haptics";
import type { Itinerary, RideLeg, WalkLeg } from "../journey-types";

// Times are anchored to "now": `trip-store` prunes any trip whose expected
// arrival is already in the past, so fixed 1970-era epochs would make a seeded
// trip vanish before the assertion runs.
const NOW = () => Math.floor(Date.now() / 1000);

const ride = (over: Partial<RideLeg> = {}): RideLeg => ({
  kind: "ride",
  routeId: "r1",
  routeShort: "1",
  routeLong: "Route 1",
  tripId: "t1",
  live: true,
  board: { stopId: "s1", name: "Board", lat: 1, lng: 1, departureUnix: NOW() + 300 },
  alight: { stopId: "s2", name: "Alight", lat: 2, lng: 2, arrivalUnix: NOW() + 900 },
  stopCount: 3,
  delaySec: 10,
  ...over,
});

const walk = (over: Partial<WalkLeg> = {}): WalkLeg => ({
  kind: "walk",
  from: { name: "Here", lat: 1, lng: 1 },
  to: { name: "Stop", lat: 1.001, lng: 1.001 },
  durationSec: 60,
  distanceMeters: 90,
  verified: false,
  ...over,
});

const baseItin = (legs: Itinerary["legs"]): Itinerary => ({
  id: "it1",
  legs,
  totalDurationSec: 500,
  departureUnix: NOW() + 120,
  arrivalUnix: NOW() + 1200,
  transfers: 0,
  totalWalkMeters: 90,
  score: 1,
  source: "live",
});

describe("itineraryToJourneyOption", () => {
  it("returns null when there is no ride leg", () => {
    expect(itineraryToJourneyOption(baseItin([walk()]))).toBeNull();
  });

  it("maps walk + ride legs, drops wait legs, and sets scheduled from source", () => {
    const it = baseItin([walk(), ride(), { kind: "wait", stopId: "s2", name: "Wait", lat: 2, lng: 2, durationSec: 30 }]);
    const opt = itineraryToJourneyOption(it);
    expect(opt).not.toBeNull();
    expect(opt?.legs).toHaveLength(2);
    expect(opt?.legs[0]).toMatchObject({ kind: "walk", durationSec: 60 });
    expect(opt?.legs[1]).toMatchObject({ kind: "bus", routeId: "r1", scheduled: false });
    expect(opt?.scheduled).toBe(false);
  });

  it("marks scheduled true when itinerary source is not 'live'", () => {
    const it = baseItin([ride({ live: false })]);
    it.source = "estimated";
    const opt = itineraryToJourneyOption(it);
    expect(opt?.legs[0]).toMatchObject({ scheduled: true });
    expect(opt?.scheduled).toBe(true);
  });
});

describe("startItinerary", () => {
  const from = { lat: 1, lng: 1, label: "From" };
  const to = { lat: 2, lng: 2, label: "To" };

  beforeEach(() => {
    __resetRouter();
    __resetHaptics();
  });

  it("no-ops (no navigation, no active trip) when there is no ride leg", () => {
    startItinerary(baseItin([walk()]), from, to);
    expect(router.__calls).toHaveLength(0);
    expect(getActiveTrip()).toBeNull();
  });

  it("seeds a single-ride trip without itinerary/legState, pushes a recent, and navigates", () => {
    startItinerary(baseItin([ride()]), from, to);
    const trip = getActiveTrip();
    expect(trip?.itinerary).toBeUndefined();
    expect(trip?.legState).toBeUndefined();
    expect(trip?.from).toEqual(from);
    expect(trip?.to).toEqual(to);
    expect(router.__calls).toHaveLength(1);
    expect(router.__calls[0]).toMatchObject({ type: "push" });
    expect(__hapticEvents()).toContain("notification:success");
  });

  it("seeds a multi-ride trip with itinerary + initial legState", () => {
    const it = baseItin([ride({ tripId: "t1" }), walk(), ride({ tripId: "t2" })]);
    startItinerary(it, from, to);
    const trip = getActiveTrip();
    expect(trip?.itinerary).toBeDefined();
    expect(trip?.legState).toEqual({ currentLegIndex: 0, perLeg: { 0: { enteredAt: expect.any(Number) } } });
  });
});
