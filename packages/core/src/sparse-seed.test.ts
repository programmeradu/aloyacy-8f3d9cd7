import { describe, expect, it } from "vitest";
import { pickSparseSeeds, SEED_MIN_RIDERSHIP, seedScore } from "./sparse-seed";

describe("seedScore", () => {
  it("ranks a busy dark line above a busy line with one phone", () => {
    expect(seedScore(100, 0)).toBeGreaterThan(seedScore(100, 1));
    expect(seedScore(SEED_MIN_RIDERSHIP - 1, 0)).toBe(0);
    expect(seedScore(200, 2)).toBe(0);
  });
});

describe("pickSparseSeeds", () => {
  it("picks busy-and-dark first, drops covered and quiet lines, caps the list", () => {
    const picked = pickSparseSeeds([
      { routeId: "quiet", ridership: 4, devices: 0 },
      { routeId: "watched", ridership: 400, devices: 8 },
      { routeId: "40", ridership: 80, devices: 0 },
      { routeId: "31", ridership: 200, devices: 0 },
      { routeId: "30", ridership: 200, devices: 1 },
    ]);
    expect(picked.map((r) => r.routeId)).toEqual(["31", "30", "40"]);
    const many = Array.from({ length: 10 }, (_, i) => ({
      routeId: String(10 + i),
      ridership: 50,
      devices: 0,
    }));
    expect(pickSparseSeeds(many)).toHaveLength(6);
  });
});
