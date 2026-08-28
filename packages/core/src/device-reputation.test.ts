import { describe, expect, it } from "vitest";
import {
  canCarryAlone,
  effectiveRiderSources,
  errorsByDevice,
  foldSightings,
  gpsReportsToSightings,
  REP_HIT_SEC,
  REP_MIN_N,
  scoreDeviceReputation,
  SOURCE_WINDOW_SEC,
} from "./device-reputation";

const STOP = { lat: 35.17, lng: 33.36 };

describe("scoreDeviceReputation", () => {
  it("cannot carry with no samples", () => {
    expect(scoreDeviceReputation([])).toEqual({ score: 0, n: 0, canCarry: false });
    expect(canCarryAlone(1, 4)).toBe(false);
  });

  it("needs five hits inside 90 s before a phone can stand alone", () => {
    const hits = Array.from({ length: REP_MIN_N }, () => 20);
    expect(scoreDeviceReputation(hits).canCarry).toBe(true);
    expect(scoreDeviceReputation(hits.slice(0, 4)).canCarry).toBe(false);
  });

  it("treats a 2-minute miss as a sample, not a skip", () => {
    const mixed = [10, 10, 10, 10, REP_HIT_SEC + 30];
    const r = scoreDeviceReputation(mixed);
    expect(r.n).toBe(5);
    expect(r.score).toBe(0.8);
    expect(r.canCarry).toBe(true);
  });

  it("drops a gap too wide to be the same stop", () => {
    expect(scoreDeviceReputation([10, 10, 10, 10, 400]).n).toBe(4);
  });
});

describe("errorsByDevice", () => {
  it("scores a fix at the stop near the truth, and ignores a far ping", () => {
    const truths = [{ tripId: "t1", stopId: "s1", routeId: "30", actualMs: 1_000_000 }];
    const fixes = [
      { tripId: "t1", deviceId: "good", lat: STOP.lat, lng: STOP.lng, tMs: 1_000_000 + 15_000 },
      { tripId: "t1", deviceId: "far", lat: STOP.lat + 0.05, lng: STOP.lng, tMs: 1_000_000 },
    ];
    const errors = errorsByDevice(truths, fixes, () => STOP);
    expect(errors.get("good")?.[0]).toBe(15);
    expect(errors.has("far")).toBe(false);
  });
});

describe("foldSightings / effectiveRiderSources", () => {
  it("names two devices, and lets a proven phone carry a lone tap", () => {
    const folded = foldSightings(
      [
        { tripId: "t", deviceId: "a", ageSec: 8 },
        { tripId: "t", deviceId: "a", ageSec: 3 },
        { tripId: "u", deviceId: "vet", ageSec: 4 },
      ],
      new Set(["vet"]),
    );
    const t = folded.find((x) => x.tripId === "t")!;
    const u = folded.find((x) => x.tripId === "u")!;
    expect(t.count).toBe(1);
    expect(t.canCarry).toBe(false);
    expect(u.canCarry).toBe(true);
    expect(effectiveRiderSources(t.count, t.canCarry)).toBe(1);
    expect(effectiveRiderSources(u.count, u.canCarry)).toBe(2);
    expect(effectiveRiderSources(undefined, false)).toBe(1);
  });

  it("unions a tap with a different phone on board, and ignores a car", () => {
    const gps = gpsReportsToSightings([
      { tripId: "t", deviceId: "board", ageSec: 8, physicsScore: 0.8 },
      { tripId: "t", deviceId: "car", ageSec: 4, physicsScore: 0.1 },
      { tripId: "t", deviceId: "stale", ageSec: SOURCE_WINDOW_SEC, physicsScore: 0.9 },
      { tripId: "t", deviceId: "", ageSec: 2, physicsScore: 0.9 },
    ]);
    const folded = foldSightings(
      [{ tripId: "t", deviceId: "tap", ageSec: 2 }, ...gps],
      new Set(),
    );
    expect(folded).toHaveLength(1);
    expect(folded[0].count).toBe(2);
  });

  it("does not double-count the same phone tapping and pinging", () => {
    const gps = gpsReportsToSightings([
      { tripId: "t", deviceId: "a", ageSec: 5, physicsScore: 0.7 },
    ]);
    const folded = foldSightings([{ tripId: "t", deviceId: "a", ageSec: 2 }, ...gps], new Set());
    expect(folded[0].count).toBe(1);
  });

  it("lets two phones on board corroborate with no tap", () => {
    const gps = gpsReportsToSightings([
      { tripId: "t", deviceId: "a", ageSec: 3, physicsScore: 0.6 },
      { tripId: "t", deviceId: "b", ageSec: 4, physicsScore: null },
    ]);
    const folded = foldSightings(gps, new Set());
    expect(folded[0].count).toBe(2);
  });
});
