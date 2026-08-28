import { describe, expect, it } from "vitest";
import {
  COVERAGE_MIN_DEVICES,
  pickCoverageRoutes,
  unionDevicesByRoute,
} from "./crowd-coverage";

describe("unionDevicesByRoute", () => {
  it("unions a tap and a GPS ping from different phones, and ignores blanks", () => {
    const rows = unionDevicesByRoute([
      { routeId: "30", deviceId: "a" },
      { routeId: "30", deviceId: "a" },
      { routeId: "30", deviceId: "b" },
      { routeId: "31", deviceId: "c" },
      { routeId: "", deviceId: "d" },
      { routeId: "40", deviceId: "" },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.routeId, r.devices]));
    expect(by["30"]).toBe(2);
    expect(by["31"]).toBe(1);
    expect(by["40"]).toBeUndefined();
  });
});

describe("pickCoverageRoutes", () => {
  it("names only routes with enough phones, busiest first, capped", () => {
    const picked = pickCoverageRoutes([
      { routeId: "quiet", devices: COVERAGE_MIN_DEVICES - 1 },
      { routeId: "30", devices: 5 },
      { routeId: "31", devices: 5 },
      { routeId: "40", devices: 2 },
    ]);
    expect(picked.map((r) => r.routeId)).toEqual(["30", "31", "40"]);
    expect(pickCoverageRoutes([])).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({
      routeId: String(100 + i),
      devices: 3,
    }));
    expect(pickCoverageRoutes(many)).toHaveLength(8);
  });
});
