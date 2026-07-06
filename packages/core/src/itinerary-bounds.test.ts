import { describe, expect, it } from "vitest";
import {
  boundsForItinerary,
  boundsForItineraryNative,
  DEFAULT_BOUNDS_OPTIONS,
  legPoints,
} from "./itinerary-bounds";
import type { Leg } from "./itinerary-types";

const walk = (a: [number, number], b: [number, number]): Leg => ({
  kind: "walk",
  from: { name: "A", lat: a[0], lng: a[1] },
  to: { name: "B", lat: b[0], lng: b[1] },
  durationSec: 300,
  distanceMeters: 400,
  verified: false,
});

const ride = (a: [number, number], b: [number, number]): Leg => ({
  kind: "ride",
  routeId: "r1",
  routeShort: "1",
  routeLong: "Route One",
  tripId: "t1",
  live: false,
  board: { stopId: "s1", name: "S1", lat: a[0], lng: a[1], departureUnix: 0 },
  alight: { stopId: "s2", name: "S2", lat: b[0], lng: b[1], arrivalUnix: 600 },
  stopCount: 4,
  delaySec: 0,
});

const wait: Leg = {
  kind: "wait",
  stopId: "s1",
  name: "S1",
  lat: 35,
  lng: 33,
  durationSec: 120,
};

describe("legPoints", () => {
  it("returns both endpoints of a ride leg", () => {
    expect(legPoints(ride([35, 33], [35.1, 33.1]))).toEqual([
      { lat: 35, lng: 33 },
      { lat: 35.1, lng: 33.1 },
    ]);
  });

  it("returns both endpoints of a walk leg", () => {
    expect(legPoints(walk([35, 33], [35.01, 33.01]))).toHaveLength(2);
  });

  it("returns a single point for a wait leg", () => {
    expect(legPoints(wait)).toEqual([{ lat: 35, lng: 33 }]);
  });
});

describe("boundsForItinerary", () => {
  it("falls back safely when there are no legs", () => {
    expect(boundsForItinerary({ legs: [] })).toEqual(DEFAULT_BOUNDS_OPTIONS.fallback);
  });

  it("centres on the midpoint of all legs", () => {
    const b = boundsForItinerary({ legs: [walk([35, 33], [35.2, 33.4])] });
    expect(b.center.lat).toBeCloseTo(35.1, 6);
    expect(b.center.lng).toBeCloseTo(33.2, 6);
  });

  it("never zooms tighter than the minimum span", () => {
    const b = boundsForItinerary({ legs: [walk([35, 33], [35.0001, 33.0001])] });
    expect(b.spanKm).toBe(DEFAULT_BOUNDS_OPTIONS.minSpanKm);
  });

  it("uses the larger of the lat/lng extents, padded", () => {
    const b = boundsForItinerary({ legs: [ride([35, 33], [35.5, 33.05])] });
    expect(b.spanKm).toBeCloseTo(0.5 * 111 * 1.3, 3);
  });

  it("spans every leg, not just the first", () => {
    const b = boundsForItinerary({
      legs: [walk([35, 33], [35.01, 33.01]), ride([35.01, 33.01], [35.4, 33.4])],
    });
    expect(b.center.lat).toBeCloseTo(35.2, 6);
  });

  it("respects a maximum span", () => {
    const b = boundsForItinerary({ legs: [ride([34.6, 32.4], [35.4, 34.0])] }, { maxSpanKm: 60 });
    expect(b.spanKm).toBe(60);
  });

  it("ignores non-finite coordinates", () => {
    const b = boundsForItinerary({
      legs: [walk([Number.NaN, Number.NaN], [Number.NaN, Number.NaN])],
    });
    expect(b).toEqual(DEFAULT_BOUNDS_OPTIONS.fallback);
  });
});

describe("boundsForItineraryNative", () => {
  it("measures the diagonal and clamps to 1–60 km", () => {
    const tiny = boundsForItineraryNative({ legs: [walk([35, 33], [35.0001, 33.0001])] });
    expect(tiny.spanKm).toBe(1);

    const huge = boundsForItineraryNative({ legs: [ride([34.6, 32.4], [35.4, 34.0])] });
    expect(huge.spanKm).toBe(60);
  });

  it("produces a diagonal span larger than a single axis", () => {
    const b = boundsForItineraryNative({ legs: [ride([35, 33], [35.1, 33.1])] });
    expect(b.spanKm).toBeGreaterThan(0.1 * 111 * 1.2 * 0.99);
  });
});
