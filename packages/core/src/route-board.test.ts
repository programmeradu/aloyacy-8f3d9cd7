import { describe, expect, it } from "vitest";

import {
  boardClock,
  buildRouteBoard,
  isIntercityRoute,
  minutesFromNow,
  nextDepartureCopy,
  routeSummaryLine,
  stopRowLabel,
  terminusLabel,
  type BoardArrival,
  type BoardVehicle,
} from "./route-board";

const T0 = 1_760_000_000; // fixed epoch for determinism

const stops: Record<string, { name: string; code?: string; lat: number; lng: number }> = {
  s1: { name: "Solomou Square · Bay A", code: "101", lat: 35.17, lng: 33.36 },
  s2: { name: "Eleftheria", code: "102", lat: 35.18, lng: 33.37 },
  s3: { name: "Latsia Terminal", lat: 35.19, lng: 33.38 },
};
const stopOf = (id: string) => stops[id];

function arrival(tripId: string, stopId: string, offsetMin: number, routeId = "R1"): BoardArrival {
  return { tripId, routeId, stopId, arrivalUnix: T0 + offsetMin * 60 };
}

describe("buildRouteBoard", () => {
  const arrivals: BoardArrival[] = [
    arrival("t1", "s1", -2),
    arrival("t1", "s2", 5),
    arrival("t1", "s3", 14),
    arrival("t2", "s1", 20),
    arrival("t2", "s2", 28),
    arrival("tOther", "s1", 1, "R9"),
  ];

  it("groups trips for the route only and sorts by next arrival", () => {
    const board = buildRouteBoard({ routeId: "R1", arrivals, vehicles: [], stopOf, nowSec: T0 });
    expect(board.trips.map((t) => t.tripId)).toEqual(["t1", "t2"]);
    expect(board.trips[0].nextArrival.stopId).toBe("s2");
    expect(board.trips[0].lastStop.stopId).toBe("s3");
  });

  it("derives the stop sequence from the longest trip", () => {
    const board = buildRouteBoard({ routeId: "R1", arrivals, vehicles: [], stopOf, nowSec: T0 });
    expect(board.stopIds).toEqual(["s1", "s2", "s3"]);
    expect(board.longest?.tripId).toBe("t1");
  });

  it("marks a stationary bus at the origin as departing", () => {
    const vehicles: BoardVehicle[] = [
      { id: "v1", tripId: "t1", routeId: "R1", lat: 35.17, lng: 33.36, speed: 0 },
    ];
    const board = buildRouteBoard({ routeId: "R1", arrivals, vehicles, stopOf, nowSec: T0 });
    expect(board.busesOnLine).toEqual([
      { vehicleId: "v1", tripId: "t1", stopIndex: 0, status: "departing", speed: 0 },
    ]);
  });

  it("marks a moving bus parked mid-line as at the stop", () => {
    const vehicles: BoardVehicle[] = [
      { id: "v1", tripId: "t1", routeId: "R1", lat: 35.18, lng: 33.37, speed: 6 },
    ];
    const board = buildRouteBoard({ routeId: "R1", arrivals, vehicles, stopOf, nowSec: T0 });
    expect(board.busesOnLine[0]).toMatchObject({ stopIndex: 1, status: "at" });
  });

  it("targets the next scheduled stop when the bus is between stops", () => {
    const vehicles: BoardVehicle[] = [
      { id: "v1", tripId: "t1", routeId: "R1", lat: 35.0, lng: 33.0, speed: 11 },
    ];
    const board = buildRouteBoard({ routeId: "R1", arrivals, vehicles, stopOf, nowSec: T0 });
    expect(board.busesOnLine[0]).toMatchObject({ stopIndex: 1, status: "approaching" });
  });

  it("ignores vehicles from other routes", () => {
    const vehicles: BoardVehicle[] = [
      { id: "v9", tripId: "tOther", routeId: "R9", lat: 35.17, lng: 33.36 },
    ];
    const board = buildRouteBoard({ routeId: "R1", arrivals, vehicles, stopOf, nowSec: T0 });
    expect(board.vehicles).toHaveLength(0);
    expect(board.busesOnLine).toHaveLength(0);
  });

  it("returns an empty board when the route has no arrivals", () => {
    const board = buildRouteBoard({ routeId: "ZZ", arrivals, vehicles: [], stopOf, nowSec: T0 });
    expect(board).toMatchObject({ trips: [], stopIds: [], busesOnLine: [], longest: undefined });
  });

  it("skips stop-matching when no stop metadata resolves", () => {
    const board = buildRouteBoard({
      routeId: "R1",
      arrivals,
      vehicles: [{ id: "v1", tripId: "t1", routeId: "R1", lat: 35.17, lng: 33.36 }],
      stopOf: () => undefined,
      nowSec: T0,
    });
    expect(board.busesOnLine).toHaveLength(0);
  });
});

describe("formatting helpers", () => {
  it("formats clock time as 24h", () => {
    expect(boardClock(T0)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("formats relative minutes with no negatives", () => {
    expect(minutesFromNow(T0 - 600, T0 * 1000)).toBe("Due");
    expect(minutesFromNow(T0 + 420, T0 * 1000)).toBe("7 min");
    expect(minutesFromNow(T0 + 4320, T0 * 1000)).toBe("1h 12m");
  });

  it("detects intercity lines by feed or prefix", () => {
    expect(isIntercityRoute({ feedId: 6 })).toBe(true);
    expect(isIntercityRoute({ short: "ic4" })).toBe(true);
    expect(isIntercityRoute({ feedId: 2, short: "30" })).toBe(false);
    expect(isIntercityRoute(undefined)).toBe(false);
  });

  it("summarises buses and stops", () => {
    const base = { trips: [], stopIds: [], longest: undefined, busesOnLine: [] };
    expect(routeSummaryLine(null)).toBe("No buses reporting right now");
    expect(routeSummaryLine({ ...base, vehicles: [{} as BoardVehicle] })).toBe("1 bus running now");
    expect(
      routeSummaryLine({
        ...base,
        vehicles: [{} as BoardVehicle, {} as BoardVehicle],
        stopIds: ["a", "b"],
      }),
    ).toBe("2 buses running now  ·  2 stops on line");
  });

  it("trims terminus labels to their leading segment", () => {
    expect(terminusLabel("Solomou Square · Bay A")).toBe("Solomou Square");
    expect(terminusLabel(undefined)).toBe("Terminus");
    expect(terminusLabel("· ")).toBe("Terminus");
  });
});

describe("stopRowLabel", () => {
  const bus = (stopIndex: number, status: "at" | "approaching" | "departing") => ({
    vehicleId: "v",
    tripId: "t",
    stopIndex,
    status,
    speed: 0,
  });

  it("prefers a bus standing at the stop", () => {
    expect(stopRowLabel({ index: 1, total: 3, buses: [bus(1, "at")] })).toEqual({
      label: "BUS AT THIS STOP",
      live: true,
    });
    expect(stopRowLabel({ index: 0, total: 3, buses: [bus(0, "departing")] }).label).toBe(
      "BUS DEPARTING NOW",
    );
    expect(stopRowLabel({ index: 2, total: 3, buses: [bus(2, "approaching")] }).label).toBe(
      "BUS APPROACHING",
    );
  });

  it("falls back to positional labels with the stop code", () => {
    expect(stopRowLabel({ index: 0, total: 3, code: "101", buses: [] })).toEqual({
      label: "ORIGIN  ·  #101",
      live: false,
    });
    expect(stopRowLabel({ index: 2, total: 3, buses: [] }).label).toBe("TERMINUS");
    expect(stopRowLabel({ index: 1, total: 3, buses: [] }).label).toBe("STOP 2");
  });
});

describe("nextDepartureCopy", () => {
  const base = {
    nextStopName: "Eleftheria",
    terminusName: "Latsia Terminal",
    arrivalUnix: T0 + 600,
    nowMs: T0 * 1000,
  };

  it("describes a scheduled departure", () => {
    const copy = nextDepartureCopy(base);
    expect(copy).toMatchObject({ kicker: "NEXT DEPARTURE", headline: "Eleftheria", isLive: false });
    expect(copy.pill).toBe("10 MIN");
    expect(copy.footer).toContain("Ends Latsia Terminal");
  });

  it("describes boarding and at-stop states", () => {
    expect(
      nextDepartureCopy({
        ...base,
        liveBus: { status: "departing", speed: 0, stopIndex: 0 },
        liveBusStopName: "Solomou Square",
      }),
    ).toMatchObject({ kicker: "ABOUT TO DEPART", headline: "Solomou Square", pill: "BOARDING" });

    expect(
      nextDepartureCopy({ ...base, liveBus: { status: "at", speed: 0, stopIndex: 1 } }),
    ).toMatchObject({ kicker: "BUS AT STOP", pill: "AT STOP", isLive: true });
  });

  it("shows speed only when the bus is really moving", () => {
    const moving = nextDepartureCopy({
      ...base,
      liveBus: { status: "approaching", speed: 10, stopIndex: 1 },
    });
    expect(moving.kicker).toBe("BUS IN MOTION");
    expect(moving.footer).toContain("36 km/h");

    const crawling = nextDepartureCopy({
      ...base,
      liveBus: { status: "approaching", speed: 0.4, stopIndex: 1 },
    });
    expect(crawling.kicker).toBe("BUS EN ROUTE");
    expect(crawling.footer).not.toContain("km/h");
  });

  it("falls back gracefully when names are missing", () => {
    const copy = nextDepartureCopy({
      nextStopName: undefined,
      terminusName: undefined,
      arrivalUnix: T0,
      nowMs: T0 * 1000,
    });
    expect(copy.headline).toBe("Upcoming stop");
    expect(copy.footer).toContain("Terminus");
    expect(copy.pill).toBe("DUE");
  });
});
