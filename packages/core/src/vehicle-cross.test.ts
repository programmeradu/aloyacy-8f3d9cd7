import { describe, expect, it } from "vitest";
import {
  interpolateStopCrossing,
  strongerTruthSource,
  vehicleCrossHits,
  VEHICLE_CROSS_MAX_GAP_MS,
  VEHICLE_CROSS_RADIUS_M,
} from "./vehicle-cross";

const STOP = { lat: 35.17, lng: 33.36 };

/** Roughly `meters` due north of STOP. 1 deg lat ≈ 111_320 m. */
function north(meters: number) {
  return { lat: STOP.lat + meters / 111_320, lng: STOP.lng };
}

describe("interpolateStopCrossing", () => {
  it("interpolates the geofence entry between an outside ping and an inside ping", () => {
    const t0 = 1_000_000;
    const outside = { tMs: t0, ...north(120) };
    const inside = { tMs: t0 + 20_000, ...north(20) };
    const hit = interpolateStopCrossing([inside, outside], STOP);
    expect(hit).not.toBeNull();
    // 120 m → 20 m over 20 s; radius 60 m is 60% of the way.
    expect(hit!.tMs).toBeGreaterThan(t0 + 10_000);
    expect(hit!.tMs).toBeLessThan(t0 + 14_000);
    expect(hit!.distBeforeM).toBeGreaterThan(VEHICLE_CROSS_RADIUS_M);
    expect(hit!.distAfterM).toBeLessThanOrEqual(VEHICLE_CROSS_RADIUS_M);
    expect(hit!.gapMs).toBe(20_000);
  });

  it("returns null when the vehicle never enters", () => {
    const t0 = 1_000_000;
    expect(
      interpolateStopCrossing(
        [
          { tMs: t0, ...north(200) },
          { tMs: t0 + 10_000, ...north(150) },
        ],
        STOP,
      ),
    ).toBeNull();
  });

  it("returns null when the first ping is already inside", () => {
    const t0 = 1_000_000;
    expect(
      interpolateStopCrossing(
        [
          { tMs: t0, ...north(20) },
          { tMs: t0 + 10_000, ...north(10) },
        ],
        STOP,
      ),
    ).toBeNull();
  });

  it("refuses a gap wider than the urban ghost cutoff", () => {
    const t0 = 1_000_000;
    expect(
      interpolateStopCrossing(
        [
          { tMs: t0, ...north(120) },
          { tMs: t0 + VEHICLE_CROSS_MAX_GAP_MS + 1, ...north(20) },
        ],
        STOP,
      ),
    ).toBeNull();
  });

  it("takes the first entry when the vehicle visits twice", () => {
    const t0 = 1_000_000;
    const hit = interpolateStopCrossing(
      [
        { tMs: t0, ...north(120) },
        { tMs: t0 + 10_000, ...north(20) },
        { tMs: t0 + 40_000, ...north(120) },
        { tMs: t0 + 50_000, ...north(20) },
      ],
      STOP,
    );
    expect(hit?.tMs).toBeLessThan(t0 + 20_000);
  });
});

describe("vehicleCrossHits", () => {
  it("resolves one stop per trip and skips unknown stops", () => {
    const t0 = 1_000_000;
    const pings = new Map([
      [
        "trip-1",
        [
          { tMs: t0, ...north(120) },
          { tMs: t0 + 20_000, ...north(20) },
        ],
      ],
    ]);
    const hits = vehicleCrossHits(
      [
        { trip_id: "trip-1", stop_id: "s1", route_id: "r1" },
        { trip_id: "trip-1", stop_id: "s1", route_id: "r1" },
        { trip_id: "trip-1", stop_id: "missing", route_id: "r1" },
      ],
      pings,
      (id) => (id === "s1" ? STOP : null),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.stop_id).toBe("s1");
    expect(hits[0]?.actualMs).toBeGreaterThan(t0);
  });
});

describe("strongerTruthSource", () => {
  it("lets vehicle replace inferred, never the other way", () => {
    expect(strongerTruthSource("vehicle", null)).toBe(true);
    expect(strongerTruthSource("vehicle", "inferred")).toBe(true);
    expect(strongerTruthSource("inferred", "vehicle")).toBe(false);
    expect(strongerTruthSource("inferred", "inferred")).toBe(false);
    expect(strongerTruthSource("rider", "inferred")).toBe(true);
    expect(strongerTruthSource("rider", "vehicle")).toBe(false);
  });
});
