import { describe, expect, it } from "vitest";
import type { Itinerary, RideLeg } from "./itinerary-types";
import {
  collectItineraryStopIds,
  filterLowFloorItineraries,
  itineraryHasKnownKerb,
  wheelchairBlocksLowFloor,
} from "./low-floor";

function ride(board: string, alight: string): RideLeg {
  return {
    kind: "ride",
    routeId: "30",
    routeShort: "30",
    routeLong: "30",
    tripId: "t",
    live: true,
    board: { stopId: board, name: board, lat: 0, lng: 0, departureUnix: 0 },
    alight: { stopId: alight, name: alight, lat: 0, lng: 0, arrivalUnix: 1 },
    stopCount: 2,
    delaySec: 0,
  };
}

function itin(id: string, board: string, alight: string): Itinerary {
  return {
    id,
    legs: [ride(board, alight)],
    totalDurationSec: 600,
    departureUnix: 0,
    arrivalUnix: 600,
    transfers: 0,
    totalWalkMeters: 0,
    score: 1,
    source: "live",
  };
}

describe("filterLowFloorItineraries", () => {
  it("drops a known kerb and keeps unknown or step-free", () => {
    expect(wheelchairBlocksLowFloor("no")).toBe(true);
    expect(wheelchairBlocksLowFloor("yes")).toBe(false);
    expect(wheelchairBlocksLowFloor("partial")).toBe(false);
    expect(wheelchairBlocksLowFloor(undefined)).toBe(false);

    const kerb = itin("k", "bad", "1009");
    const ok = itin("ok", "1009", "1001");
    const unknown = itin("u", "mystery", "1009");
    const access = { bad: "no", "1009": "yes", "1001": "partial" };

    expect(itineraryHasKnownKerb(kerb, access)).toBe(true);
    expect(collectItineraryStopIds([kerb, ok]).sort()).toEqual(["1001", "1009", "bad"]);
    expect(filterLowFloorItineraries([kerb, ok, unknown], access).map((i) => i.id)).toEqual([
      "ok",
      "u",
    ]);
  });

  it("returns empty when every option uses a known kerb", () => {
    const a = itin("a", "bad", "also-bad");
    const access = { bad: "no", "also-bad": "no" };
    expect(filterLowFloorItineraries([a], access)).toEqual([]);
  });

  it("leaves an empty list empty", () => {
    expect(filterLowFloorItineraries([], { bad: "no" })).toEqual([]);
  });
});
