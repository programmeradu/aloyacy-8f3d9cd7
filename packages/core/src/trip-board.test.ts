import { describe, it, expect } from "vitest";
import {
  buildTripBoard,
  tripLengthKm,
  fleetLabel,
  tripStatusView,
  minutesUntil,
  stopDelayBadge,
  tripMetaLine,
  type TripArrivalInput,
  type TripStopMeta,
} from "./trip-board";

const STOPS: Record<string, TripStopMeta> = {
  a: { name: "Solomou Square", code: "101", lat: 35.1725, lng: 33.3585 },
  b: { name: "Eleftheria Square", code: "102", lat: 35.1738, lng: 33.3609 },
  c: { name: "Kaimakli", code: "103", lat: 35.1802, lng: 33.3712 },
};

function arr(stopId: string, arrivalUnix: number, delaySec = 0): TripArrivalInput {
  return { stopId, tripId: "T1", routeId: "R1", arrivalUnix, delaySec };
}

const resolve = (id: string) => STOPS[id];

describe("buildTripBoard", () => {
  const now = 1_000_000;

  it("returns null when the trip has no arrivals", () => {
    expect(buildTripBoard([], "T1", now, resolve)).toBeNull();
    expect(buildTripBoard([{ ...arr("a", now), tripId: "OTHER" }], "T1", now, resolve)).toBeNull();
  });

  it("orders arrivals ascending regardless of feed order", () => {
    const board = buildTripBoard(
      [arr("c", now + 600), arr("a", now - 600), arr("b", now + 120)],
      "T1",
      now,
      resolve,
    )!;
    expect(board.stops.map((s) => s.stopId)).toEqual(["a", "b", "c"]);
    expect(board.stops.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(board.routeId).toBe("R1");
  });

  it("tags passed / next / upcoming around the current time", () => {
    const board = buildTripBoard(
      [arr("a", now - 600), arr("b", now + 120), arr("c", now + 600)],
      "T1",
      now,
      resolve,
    )!;
    expect(board.nextIdx).toBe(1);
    expect(board.stops.map((s) => s.passed)).toEqual([true, false, false]);
    expect(board.stops.map((s) => s.next)).toEqual([false, true, false]);
  });

  it("keeps a just-passed stop as next inside the grace window", () => {
    const board = buildTripBoard([arr("a", now - 20), arr("b", now + 300)], "T1", now, resolve)!;
    expect(board.nextIdx).toBe(0);
    expect(board.stops[0].next).toBe(true);
    expect(board.stops[0].passed).toBe(false);
  });

  it("marks every stop passed once the trip has finished", () => {
    const board = buildTripBoard([arr("a", now - 900), arr("b", now - 600)], "T1", now, resolve)!;
    expect(board.nextIdx).toBe(-1);
    expect(board.stops.every((s) => s.passed)).toBe(true);
    expect(board.stops.some((s) => s.next)).toBe(false);
  });

  it("attaches resolved stop metadata and tolerates unknown stops", () => {
    const board = buildTripBoard([arr("a", now), arr("zz", now + 60)], "T1", now, resolve)!;
    expect(board.stops[0].meta?.name).toBe("Solomou Square");
    expect(board.stops[1].meta).toBeUndefined();
  });
});

describe("tripLengthKm", () => {
  it("sums consecutive stop distances", () => {
    const km = tripLengthKm([{ meta: STOPS.a }, { meta: STOPS.b }, { meta: STOPS.c }]);
    expect(km).toBeGreaterThan(0.9);
    expect(km).toBeLessThan(2.5);
  });

  it("skips gaps where metadata is missing", () => {
    expect(tripLengthKm([{ meta: STOPS.a }, {}, { meta: STOPS.c }])).toBe(0);
    expect(tripLengthKm([])).toBe(0);
    expect(tripLengthKm([{ meta: STOPS.a }])).toBe(0);
  });
});

describe("fleetLabel", () => {
  it("shows short alphanumeric fleet numbers", () => {
    expect(fleetLabel("412")).toBe("Bus 412");
    expect(fleetLabel(" A-17 ")).toBe("Bus A-17");
  });

  it("falls back for missing or entity-id style labels", () => {
    expect(fleetLabel(null)).toBe("Live trip");
    expect(fleetLabel("")).toBe("Live trip");
    expect(fleetLabel("7")).toBe("Live trip");
    expect(fleetLabel("veh_98213_intercity")).toBe("Live trip");
  });
});

describe("tripStatusView", () => {
  it("reports finished trips", () => {
    const v = tripStatusView(500, true);
    expect(v.status).toBe("done");
    expect(v.label).toBe("Finished");
    expect(v.tag).toBe("end");
  });

  it("treats sub-minute drift as on time", () => {
    expect(tripStatusView(0, false).status).toBe("ontime");
    expect(tripStatusView(59, false).label).toBe("On time");
    expect(tripStatusView(-60, false).status).toBe("ontime");
  });

  it("describes late and early runs in whole minutes", () => {
    expect(tripStatusView(245, false)).toMatchObject({
      status: "late",
      label: "4 min late",
      minutes: 4,
    });
    expect(tripStatusView(-190, false)).toMatchObject({ status: "early", label: "3 min early" });
  });
});

describe("minutesUntil", () => {
  it("rounds to whole minutes and never goes negative", () => {
    expect(minutesUntil(1000 + 300, 1000)).toBe(5);
    expect(minutesUntil(1000 - 900, 1000)).toBe(0);
    expect(minutesUntil(1000 + 29, 1000)).toBe(0);
  });
});

describe("stopDelayBadge", () => {
  it("hides drift inside tolerance and signs the rest", () => {
    expect(stopDelayBadge(30)).toBeNull();
    expect(stopDelayBadge(-45)).toBeNull();
    expect(stopDelayBadge(180)).toBe("+3m");
    expect(stopDelayBadge(-180)).toBe("-3m");
  });
});

describe("tripMetaLine", () => {
  it("composes stop count, length and terminus without bullet characters", () => {
    const line = tripMetaLine(14, 8.24, "Kaimakli");
    expect(line).toBe("14 stops   8.2 km of route   ends at Kaimakli");
    expect(line).not.toMatch(/[·•]/);
  });

  it("drops absent parts and singularises one stop", () => {
    expect(tripMetaLine(1, null, null)).toBe("1 stop");
    expect(tripMetaLine(3, 0.01, null)).toBe("3 stops");
  });
});
