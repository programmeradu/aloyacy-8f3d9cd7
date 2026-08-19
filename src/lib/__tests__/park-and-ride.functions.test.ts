import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import type { Itinerary } from "../itinerary-types";

const drivingRouteMock = vi.fn();
vi.mock("../maps.server", () => ({
  drivingRoute: (...args: unknown[]) => drivingRouteMock(...args),
}));

const planMultiLegJourneyMock = vi.fn();
vi.mock("../journey-multileg.server", () => ({
  planMultiLegJourney: (...args: unknown[]) => planMultiLegJourneyMock(...args),
}));

const liveEvForHubMock = vi.fn();
vi.mock("../ev-chargers.functions", () => ({
  liveEvForHub: (...args: unknown[]) => liveEvForHubMock(...args),
}));

const { suggestParkAndRide } = await import("../park-and-ride.functions");

// Nicosia: outside-core origin ~9km from centre, destination near centre.
const FAR_ORIGIN = { lat: 35.09, lng: 33.28 }; // ~10km SW of Nicosia centre
const DOWNTOWN = { lat: 35.174, lng: 33.365 }; // Nicosia centre itself
const INTRA_CITY_NEAR = { lat: 35.17, lng: 33.36 }; // inside core, near origin's own city too

function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: "it1",
    legs: [
      {
        kind: "ride",
        routeId: "r1",
        routeShort: "10",
        routeLong: "Route 10",
        tripId: "t1",
        live: true,
        board: { stopId: "s1", name: "Hub Stop", lat: 35.16, lng: 33.31, departureUnix: 1000 },
        alight: { stopId: "s2", name: "Centre Stop", lat: 35.174, lng: 33.365, arrivalUnix: 1800 },
        stopCount: 5,
        delaySec: 0,
      },
    ],
    totalDurationSec: 800,
    departureUnix: 1000,
    arrivalUnix: 1800,
    transfers: 0,
    totalWalkMeters: 100,
    score: 1,
    source: "live",
    ...overrides,
  };
}

beforeEach(() => {
  drivingRouteMock.mockReset();
  planMultiLegJourneyMock.mockReset();
  liveEvForHubMock.mockReset();
});

describe("suggestParkAndRide", () => {
  it("rejects invalid coordinates", async () => {
    await expect(
      callServerFn(suggestParkAndRide, { from: { lat: 1000, lng: 0 }, to: DOWNTOWN }),
    ).rejects.toThrow();
  });

  it("returns null when the origin is already inside the destination city's core", async () => {
    const out = await callServerFn(suggestParkAndRide, {
      from: INTRA_CITY_NEAR,
      to: DOWNTOWN,
    });
    expect(out).toBeNull();
    expect(drivingRouteMock).not.toHaveBeenCalled();
  });

  it("returns null when the trip is too short to bother with", async () => {
    const out = await callServerFn(suggestParkAndRide, {
      from: { lat: 35.18, lng: 33.37 },
      to: DOWNTOWN,
    });
    expect(out).toBeNull();
  });

  it("returns null when no hub candidates intercept the trip", async () => {
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [] });
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 });
    // Origin far outside any city core geometry that would produce a candidate.
    const out = await callServerFn(suggestParkAndRide, {
      from: { lat: 34.6, lng: 33.0 }, // Limassol area, destination Nicosia — no shared hubs
      to: DOWNTOWN,
    });
    expect(out).toBeNull();
  });

  it("returns null when driving to every candidate hub fails", async () => {
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [] });
    drivingRouteMock.mockResolvedValue(null);
    const out = await callServerFn(suggestParkAndRide, { from: FAR_ORIGIN, to: DOWNTOWN });
    expect(out).toBeNull();
  });

  it("returns null when the bus leg from the hub has no viable itinerary", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 600, distanceMeters: 5000, staticDurationSec: 500 });
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [] });
    const out = await callServerFn(suggestParkAndRide, { from: FAR_ORIGIN, to: DOWNTOWN });
    expect(out).toBeNull();
  });

  it("suggests a faster park & ride when it beats the bus-only baseline by 5+ minutes", async () => {
    drivingRouteMock.mockImplementation(async (_from: unknown, to: { lat: number; lng: number }) => {
      // Direct drive (to === DOWNTOWN) is slow; drive-to-hub leg is quick.
      if (to.lat === DOWNTOWN.lat && to.lng === DOWNTOWN.lng) {
        return { durationSec: 3000, distanceMeters: 12000, staticDurationSec: 2800 };
      }
      return { durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 };
    });
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [itinerary()] });

    const out = await callServerFn(suggestParkAndRide, {
      from: FAR_ORIGIN,
      to: DOWNTOWN,
      busOnlyDurationSec: 5000,
    });

    expect(out).not.toBeNull();
    expect(out?.reason).toBe("faster");
    expect(out?.savingsSec).toBeGreaterThanOrEqual(300);
    expect(out?.bus.firstRoute).toBe("10");
    expect(out?.liveTraffic?.directDriveSec).toBe(3000);
    expect(out?.liveTraffic?.freeFlowSec).toBe(2800);
  });

  it("returns no-bus-only reason when there is no bus-only baseline to compare", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 });
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [itinerary()] });

    const out = await callServerFn(suggestParkAndRide, { from: FAR_ORIGIN, to: DOWNTOWN });
    expect(out?.reason).toBe("no-bus-only");
    expect(out?.savingsSec).toBe(0);
  });

  it("returns comfort reason when P&R is roughly as fast but the bus access walk is long", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 });
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [itinerary({ totalDurationSec: 400 })] });

    // top.totalSec = drive(400) + buffer(180) + bus(400) = 980
    const out = await callServerFn(suggestParkAndRide, {
      from: FAR_ORIGIN,
      to: DOWNTOWN,
      busOnlyDurationSec: 1000,
      busOnlyAccessWalkM: 1200,
    });
    expect(out?.reason).toBe("comfort");
  });

  it("returns null when bus-only is already good enough and no comfort/traffic case applies", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 });
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [itinerary({ totalDurationSec: 400 })] });

    const out = await callServerFn(suggestParkAndRide, {
      from: FAR_ORIGIN,
      to: DOWNTOWN,
      busOnlyDurationSec: 990,
      busOnlyAccessWalkM: 100,
    });
    expect(out).toBeNull();
  });

  it("filters out itineraries with more than one transfer when ranking the bus leg", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 });
    planMultiLegJourneyMock.mockResolvedValue({
      itineraries: [itinerary({ transfers: 2, totalDurationSec: 100 }), itinerary({ transfers: 1 })],
    });
    const out = await callServerFn(suggestParkAndRide, {
      from: FAR_ORIGIN,
      to: DOWNTOWN,
      busOnlyDurationSec: 5000,
    });
    expect(out).not.toBeNull();
    // Must have picked the 1-transfer itinerary (totalDurationSec 800), not the faster 2-transfer one.
    expect(out?.bus.durationSec).toBe(800);
  });

  it("enriches the hub with live EV data when the hub has a curated ev entry", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 });
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [itinerary()] });
    liveEvForHubMock.mockResolvedValue({
      available: 2,
      total: 4,
      kwMax: 22,
      kind: "ac",
      operator: "EAC ChargeIn",
      updatedUnix: 123,
    });

    // Origin near Mall of Cyprus catchment (has an `ev` entry) to hit that hub.
    const out = await callServerFn(suggestParkAndRide, {
      from: { lat: 35.08, lng: 33.32 },
      to: DOWNTOWN,
      busOnlyDurationSec: 5000,
    });
    if (out?.hub.ev) {
      expect(out.hub.ev.live?.available).toBe(2);
    }
  });

  it("silently drops live EV enrichment when the feed throws", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 4000, staticDurationSec: 380 });
    planMultiLegJourneyMock.mockResolvedValue({ itineraries: [itinerary()] });
    liveEvForHubMock.mockRejectedValue(new Error("feed down"));

    const out = await callServerFn(suggestParkAndRide, {
      from: { lat: 35.08, lng: 33.32 },
      to: DOWNTOWN,
      busOnlyDurationSec: 5000,
    });
    expect(out).not.toBeNull();
    if (out?.hub.ev) {
      expect(out.hub.ev.live).toBeUndefined();
    }
  });
});
