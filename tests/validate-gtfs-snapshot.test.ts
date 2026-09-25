import { describe, expect, it } from "vitest";
import { CYPRUS_BOUNDS, validateGtfsSnapshot } from "../scripts/validate-gtfs-snapshot.mjs";

describe("validateGtfsSnapshot data-quality assertions", () => {
  const now = Math.floor(Date.now() / 1000);
  const validSnapshot = {
    fetchedAt: now,
    arrivals: [
      {
        routeId: "X400",
        stopId: "kokkino-village-stop",
        tripId: "trip-400-01",
        arrivalUnix: now + 900,
        delaySec: 45,
      },
    ],
    vehicles: [
      {
        id: "v-1",
        tripId: "trip-400-01",
        lat: 35.15,
        lng: 33.2,
      },
    ],
  };

  it("passes for valid snapshot within Cyprus boundaries", () => {
    const res = validateGtfsSnapshot(validSnapshot);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.summary.boundedVehicles).toBe(1);
    expect(res.summary.validArrivals).toBe(1);
  });

  it("fails when vehicle coordinates fall outside Cyprus bounds", () => {
    const badCoordSnapshot = {
      ...validSnapshot,
      vehicles: [
        {
          id: "v-london",
          lat: 51.5, // London, UK
          lng: -0.12,
        },
      ],
    };
    const res = validateGtfsSnapshot(badCoordSnapshot);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("out of Cyprus bounds"))).toBe(true);
  });

  it("enforces boundary constants conform to Cyprus bounds", () => {
    expect(CYPRUS_BOUNDS.MIN_LAT).toBe(34.5);
    expect(CYPRUS_BOUNDS.MAX_LAT).toBe(35.7);
    expect(CYPRUS_BOUNDS.MIN_LNG).toBe(32.2);
    expect(CYPRUS_BOUNDS.MAX_LNG).toBe(34.6);
  });

  it("detects invalid/missing identifiers and timestamps", () => {
    const invalidSnapshot = {
      fetchedAt: "not-a-number",
      arrivals: [
        {
          routeId: "",
          stopId: "stop-1",
          tripId: "trip-1",
          arrivalUnix: -100,
          delaySec: 2.5, // non-integer
        },
      ],
      vehicles: [],
    };
    const res = validateGtfsSnapshot(invalidSnapshot);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(1);
  });
});
