import { describe, expect, it } from "vitest";
import { stop as stopEn } from "./dictionaries/en/stop";
import {
  SKIP_NEIGHBOUR_MAX_M,
  SKIP_NEIGHBOUR_MIN_M,
  compassOf,
  pickSkipNeighbour,
  roundWalkM,
  skipRateNeighbourLine,
  type NeighbourCandidate,
} from "./skip-neighbour";
import type { SkipSlot } from "./skip-rate";

const HERE: NeighbourCandidate = {
  stopId: "1009",
  name: "Solomos",
  lat: 35.17,
  lng: 33.36,
};

function at(metersNorth: number, metersEast: number, id: string, name: string): NeighbourCandidate {
  return {
    stopId: id,
    name,
    lat: HERE.lat + metersNorth / 111_320,
    lng: HERE.lng + metersEast / (111_320 * Math.cos((HERE.lat * Math.PI) / 180)),
  };
}

const evening = Date.UTC(2026, 7, 27, 16, 0); // 19:00 Cyprus

describe("compass / round", () => {
  it("names the four directions from the coords, and rounds to 10 m", () => {
    expect(compassOf(HERE, at(200, 0, "n", "N"))).toBe("north");
    expect(compassOf(HERE, at(0, 200, "e", "E"))).toBe("east");
    expect(compassOf(HERE, at(-200, 0, "s", "S"))).toBe("south");
    expect(compassOf(HERE, at(0, -200, "w", "W"))).toBe("west");
    expect(roundWalkM(184)).toBe(180);
    expect(SKIP_NEIGHBOUR_MIN_M).toBe(80);
    expect(SKIP_NEIGHBOUR_MAX_M).toBe(400);
  });
});

describe("pickSkipNeighbour", () => {
  it("picks the nearest same-route stop in walk range", () => {
    const hit = pickSkipNeighbour(
      HERE,
      "30",
      [at(180, 0, "n180", "Makarios"), at(300, 0, "n300", "Far")],
      [],
      evening,
    );
    expect(hit).toEqual({
      stopId: "n180",
      name: "Makarios",
      meters: 180,
      compass: "north",
    });
  });

  it("stays silent inside the cluster, past a walk, or without a name", () => {
    expect(pickSkipNeighbour(HERE, "30", [at(40, 0, "pole", "Pole")], [], evening)).toBeNull();
    expect(pickSkipNeighbour(HERE, "30", [at(600, 0, "far", "Far")], [], evening)).toBeNull();
    expect(pickSkipNeighbour(HERE, "30", [at(180, 0, "x", "  ")], [], evening)).toBeNull();
  });

  it("rejects a neighbour that also skips, and takes the next one", () => {
    const skipped: SkipSlot = {
      stopId: "n180",
      routeId: "30",
      when: "weekdayEvening",
      n: 10,
      skipped: 4,
    };
    const hit = pickSkipNeighbour(
      HERE,
      "30",
      [at(180, 0, "n180", "Makarios"), at(250, 0, "n250", "Next")],
      [skipped],
      evening,
    );
    expect(hit?.stopId).toBe("n250");
    expect(hit?.compass).toBe("north");
  });
});

describe("copy", () => {
  it("names the measured neighbour, never an invented 200 m", () => {
    const line = skipRateNeighbourLine("31", 5, "on weekday evenings", "Makarios", 180, "north");
    expect(line).toBe(
      "Bus 31 skips this stop about 1 in 5 on weekday evenings. Wave clearly, or use Makarios 180 m north.",
    );
    expect(stopEn["stop.skipRateNeighbour"]).toBe(
      "Bus {route} skips this stop about 1 in {k} {when}. Wave clearly, or use {stop} {meters} m {compass}.",
    );
    expect(line).not.toMatch(/This 31|The 31|€|taxi|RAPTOR|Green Line|luggage|200 m north/i);
  });
});
