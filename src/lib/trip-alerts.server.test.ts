import { describe, expect, it } from "vitest";
import { currentRideTripId, buildPayload, type ActiveTripRow } from "./trip-alerts.server";
import { STILL_ON_ALERT } from "@aloya/core/multileg-banners";
import type { RideLeg } from "./itinerary-types";

const NOW = 1_700_000_000;

function ride(over: Partial<RideLeg> & Pick<RideLeg, "tripId">): RideLeg {
  return {
    kind: "ride",
    routeId: "r1",
    routeShort: "31",
    routeLong: "31",
    live: true,
    board: { stopId: "A", name: "A", lat: 0, lng: 0, departureUnix: NOW - 60 },
    alight: { stopId: "B", name: "B", lat: 0, lng: 0, arrivalUnix: NOW + 600 },
    stopCount: 4,
    delaySec: 0,
    ...over,
  };
}

function row(over: Partial<ActiveTripRow> = {}): ActiveTripRow {
  return {
    device_id: "d1",
    trip_id: "t-row",
    route_short: "31",
    board_stop_id: "A",
    board_name: "A",
    board_unix: NOW - 60,
    alight_stop_id: "B",
    alight_name: "B",
    alight_unix: NOW + 600,
    walk_in_sec: 0,
    walk_out_sec: 0,
    alerts_sent: [],
    legs: null,
    total_arrival_unix: NOW + 600,
    ...over,
  };
}

describe("currentRideTripId", () => {
  it("uses the row trip while they are on it", () => {
    expect(currentRideTripId(row(), NOW)).toBe("t-row");
    expect(currentRideTripId(row({ board_unix: NOW + 120 }), NOW)).toBeNull();
    expect(currentRideTripId(row({ alight_unix: NOW - 1 }), NOW)).toBeNull();
  });

  it("picks the ride they are on in a two-bus trip", () => {
    const first = ride({
      tripId: "t1",
      board: { stopId: "A", name: "A", lat: 0, lng: 0, departureUnix: NOW - 800 },
      alight: { stopId: "X", name: "X", lat: 0, lng: 0, arrivalUnix: NOW - 20 },
    });
    const second = ride({ tripId: "t2" });
    expect(currentRideTripId(row({ legs: [first, second] }), NOW)).toBe("t2");
  });
});

describe("still-on payload", () => {
  it("asks still on Bus 31 without a waiter count", () => {
    const p = buildPayload(STILL_ON_ALERT, row(), 0);
    expect(p.title).toBe("Still on Bus 31?");
    expect(String(p.body)).not.toMatch(/\d+\s+people/);
    expect(p.tag).toContain("still-on");
  });
});
