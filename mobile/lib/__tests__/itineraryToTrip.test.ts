import { beforeEach, describe, expect, it } from "vitest";
import { itineraryToJourneyOption, startItinerary } from "@/lib/itineraryToTrip";
import { getActiveTrip, listRecents } from "@/lib/trip-store";
// The suite aliases `expo-router` to this stub; importing it by path keeps
// TypeScript honest about the recorder helpers it exposes.
import { navigations, __resetNavigations } from "../../test/stubs/expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/journey-types";

const reset = () => (AsyncStorage as unknown as { __reset(): void }).__reset();

// The store prunes any trip whose expected arrival is more than two hours in
// the past, so fixtures ride on a "now"-relative clock rather than epoch 0.
const NOW_SEC = Math.floor(Date.now() / 1000);

const rideLeg = (over: Partial<RideLeg> = {}): RideLeg => ({
  kind: "ride",
  routeId: "r1",
  routeShort: "1",
  routeLong: "Route One",
  tripId: "t1",
  live: true,
  board: { stopId: "a", name: "A", lat: 0, lng: 0, departureUnix: NOW_SEC + 300 },
  alight: { stopId: "b", name: "B", lat: 0, lng: 0, arrivalUnix: NOW_SEC + 900 },
  stopCount: 4,
  delaySec: 30,
  ...over,
});

const walkLeg = (over: Partial<WalkLeg> = {}): WalkLeg => ({
  kind: "walk",
  from: { name: "Home", lat: 0, lng: 0 },
  to: { name: "A", lat: 0, lng: 0 },
  durationSec: 120,
  distanceMeters: 150,
  verified: true,
  ...over,
});

const itinerary = (over: Partial<Itinerary> = {}): Itinerary => ({
  id: "it-1",
  legs: [walkLeg(), rideLeg(), walkLeg({ from: { name: "B", lat: 0, lng: 0 }, to: { name: "Work", lat: 1, lng: 1 } })],
  totalDurationSec: 900,
  departureUnix: NOW_SEC + 120,
  arrivalUnix: NOW_SEC + 1020,
  transfers: 0,
  totalWalkMeters: 270,
  score: 1,
  source: "live",
  ...over,
});

beforeEach(() => {
  reset();
  __resetNavigations();
});

describe("itineraryToJourneyOption", () => {
  it("returns null when the itinerary has no ride leg", () => {
    const result = itineraryToJourneyOption(itinerary({ legs: [walkLeg()] }));
    expect(result).toBeNull();
  });

  it("maps ride and walk legs, dropping wait legs", () => {
    const it = itinerary({
      legs: [walkLeg(), { kind: "wait", stopId: "a", name: "A", lat: 0, lng: 0, durationSec: 60 }, rideLeg()],
    });
    const result = itineraryToJourneyOption(it)!;
    expect(result.legs.map((l) => l.kind)).toEqual(["walk", "bus"]);
  });

  it("marks a bus leg 'scheduled' when the ride leg is not live", () => {
    const it = itinerary({ legs: [rideLeg({ live: false })] });
    const result = itineraryToJourneyOption(it)!;
    expect((result.legs[0] as { scheduled?: boolean }).scheduled).toBe(true);
  });

  it("marks the option 'scheduled' whenever the itinerary source isn't 'live'", () => {
    const live = itineraryToJourneyOption(itinerary({ source: "live" }))!;
    const estimated = itineraryToJourneyOption(itinerary({ source: "estimated" }))!;
    expect(live.scheduled).toBe(false);
    expect(estimated.scheduled).toBe(true);
  });

  it("copies through id, timing, and transfer count unchanged", () => {
    const it = itinerary({ id: "abc", totalDurationSec: 555, departureUnix: 10, arrivalUnix: 565, transfers: 2 });
    const result = itineraryToJourneyOption(it)!;
    expect(result).toMatchObject({ id: "abc", totalDurationSec: 555, departureUnix: 10, arrivalUnix: 565, transfers: 2 });
  });
});

describe("startItinerary", () => {
  const from = { lat: 35.17, lng: 33.36, label: "Home" };
  const to = { lat: 34.9, lng: 33.6, label: "Work" };

  it("does nothing when the itinerary has no ride leg", () => {
    startItinerary(itinerary({ legs: [walkLeg()] }), from, to);
    expect(getActiveTrip()).toBeNull();
    expect(navigations).toHaveLength(0);
  });

  it("seeds the active trip store with the derived journey option", () => {
    startItinerary(itinerary(), from, to);
    const trip = getActiveTrip();
    expect(trip).not.toBeNull();
    expect(trip?.from).toEqual(from);
    expect(trip?.to).toEqual(to);
    expect(trip?.option.id).toBe("it-1");
  });

  it("omits itinerary/legState for a single-ride trip", () => {
    startItinerary(itinerary({ legs: [walkLeg(), rideLeg()] }), from, to);
    const trip = getActiveTrip();
    expect(trip?.itinerary).toBeUndefined();
    expect(trip?.legState).toBeUndefined();
  });

  it("attaches itinerary + initial legState for a multi-ride trip", () => {
    startItinerary(
      itinerary({ legs: [rideLeg({ tripId: "t1" }), walkLeg(), rideLeg({ tripId: "t2" })] }),
      from,
      to,
    );
    const trip = getActiveTrip();
    expect(trip?.itinerary).toBeDefined();
    expect(trip?.legState).toEqual({ currentLegIndex: 0, perLeg: { 0: { enteredAt: expect.any(Number) } } });
  });

  it("pushes the destination into recents", () => {
    startItinerary(itinerary(), from, to);
    const recents = listRecents();
    expect(recents[0]).toMatchObject({ name: to.label, lat: to.lat, lng: to.lng });
  });

  it("navigates to the trip screen with the option id", () => {
    startItinerary(itinerary(), from, to);
    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toEqual({
      method: "push",
      target: { pathname: "/trip/[id]", params: { id: "it-1" } },
    });
  });
});
