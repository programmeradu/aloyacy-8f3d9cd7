import { describe, expect, it } from "vitest";
import { otherStopAsk, otherStopLine } from "./other-stop";

const NOW = 1_700_000_000;

function ride(over: { stopId?: string; name?: string; leaveSec?: number; short?: string } = {}) {
  return {
    kind: "ride" as const,
    routeShort: over.short ?? "25",
    board: {
      stopId: over.stopId ?? "B",
      name: over.name ?? "Makariou",
      departureUnix: NOW + (over.leaveSec ?? 180),
    },
  };
}

function walk(m: number) {
  return { kind: "walk" as const, distanceMeters: m };
}

describe("otherStopAsk", () => {
  it("names the other stop when RAPTOR boards somewhere else", () => {
    const ask = otherStopAsk({
      legs: [walk(220), ride()],
      hereStopId: "A",
      nowUnix: NOW,
    });
    expect(ask).toEqual({ routeShort: "25", stopName: "Makariou", leaveMin: 3 });
    expect(otherStopLine(ask!)).toBe("Bus 25 leaves in 3 min from Makariou.");
  });

  it("stays quiet on the same stop", () => {
    expect(
      otherStopAsk({
        legs: [ride({ stopId: "A", name: "Solomou" })],
        hereStopId: "A",
        nowUnix: NOW,
      }),
    ).toBeNull();
  });

  it("needs a real walk when we do not know the wait stop", () => {
    expect(otherStopAsk({ legs: [walk(20), ride()], nowUnix: NOW })).toBeNull();
    expect(otherStopAsk({ legs: [walk(200), ride({ leaveSec: 0 })], nowUnix: NOW })).toEqual({
      routeShort: "25",
      stopName: "Makariou",
      leaveMin: 0,
    });
    expect(otherStopLine({ routeShort: "25", stopName: "Makariou", leaveMin: 0 })).toBe(
      "Bus 25 leaves now from Makariou.",
    );
  });

  it("does not invent a taxi euro", () => {
    expect(otherStopLine({ routeShort: "25", stopName: "Makariou", leaveMin: 3 })).not.toMatch(
      /€|taxi|Bolt|luggage/i,
    );
  });
});
