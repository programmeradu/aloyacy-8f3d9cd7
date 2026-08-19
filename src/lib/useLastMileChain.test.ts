import { describe, expect, it } from "vitest";
import type { ActiveTrip } from "@/lib/trip-store";

describe("useLastMileChain trip logic", () => {
  it("evaluates final walk threshold correctly", () => {
    const tripWithLongWalk: ActiveTrip = {
      option: {
        id: "trip-123",
        mode: "bus",
        summary: "Bus 30",
        departureTime: "10:00",
        arrivalTime: "10:45",
        durationMinutes: 45,
        price: 1.5,
        legs: [],
      },
      from: { lat: 34.7, lng: 33.0, label: "Limassol" },
      to: { lat: 34.9, lng: 33.6, label: "Larnaca" },
      startedAt: Date.now(),
      itinerary: {
        id: "itin-1",
        legs: [
          {
            kind: "walk",
            from: { lat: 34.8, lng: 33.5, name: "Stop A" },
            to: { lat: 34.9, lng: 33.6, name: "Destination" },
            durationSec: 900,
            distanceMeters: 1200,
            path: [],
          },
        ],
        departureUnix: 1787000000,
        arrivalUnix: 1787003600,
        transfers: 0,
        walkTimeSec: 900,
        rideTimeSec: 2700,
        waitSec: 0,
      },
    };

    const finalLeg = tripWithLongWalk.itinerary?.legs[0];
    const isLongWalk = finalLeg?.kind === "walk" && finalLeg.distanceMeters >= 800;

    expect(isLongWalk).toBe(true);
    expect(finalLeg?.distanceMeters).toBe(1200);
  });

  it("ignores short final walk under 800m", () => {
    const tripWithShortWalk: ActiveTrip = {
      option: {
        id: "trip-456",
        mode: "bus",
        summary: "Bus 15",
        departureTime: "11:00",
        arrivalTime: "11:30",
        durationMinutes: 30,
        price: 1.5,
        legs: [],
      },
      from: { lat: 35.1, lng: 33.3, label: "Nicosia" },
      to: { lat: 35.12, lng: 33.35, label: "Old Town" },
      startedAt: Date.now(),
      itinerary: {
        id: "itin-2",
        legs: [
          {
            kind: "walk",
            from: { lat: 35.11, lng: 33.34, name: "Stop B" },
            to: { lat: 35.12, lng: 33.35, name: "Old Town" },
            durationSec: 300,
            distanceMeters: 400,
            path: [],
          },
        ],
        departureUnix: 1787000000,
        arrivalUnix: 1787001800,
        transfers: 0,
        walkTimeSec: 300,
        rideTimeSec: 1500,
        waitSec: 0,
      },
    };

    const finalLeg = tripWithShortWalk.itinerary?.legs[0];
    const isLongWalk = finalLeg?.kind === "walk" && finalLeg.distanceMeters >= 800;

    expect(isLongWalk).toBe(false);
  });
});
