import { describe, expect, it } from "vitest";
import {
  ACCURACY_HARD_M,
  RIDER_PHYSICS_FOLD_MIN,
  RIDER_PHYSICS_OVERRIDE_MIN,
  SNAP_HARD_M,
  URBAN_MAX_MPS,
  riderFold,
  scoreRiderFix,
  type RiderFixSample,
} from "./rider-physics";

const T0 = Date.UTC(2026, 7, 28, 8, 0, 0);

const shape = [
  { lat: 35.17, lng: 33.36 },
  { lat: 35.18, lng: 33.36 },
  { lat: 35.19, lng: 33.36 },
];

const onRoute = (over: Partial<RiderFixSample> = {}): RiderFixSample => ({
  lat: 35.175,
  lng: 33.36,
  tMs: T0,
  speedMps: 8,
  accuracyM: 8,
  ...over,
});

describe("scoreRiderFix", () => {
  it("trusts a tight on-route ping", () => {
    const r = scoreRiderFix({ fix: onRoute(), prior: [], shape, agency: "OS" });
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.snapM).not.toBeNull();
    expect(r.snapM!).toBeLessThan(5);
  });

  it("zeros an 80 m-plus accuracy ping", () => {
    const r = scoreRiderFix({
      fix: onRoute({ accuracyM: ACCURACY_HARD_M + 1 }),
      prior: [],
      shape,
    });
    expect(r.score).toBe(0);
  });

  it("zeros a ping far off the shape", () => {
    const r = scoreRiderFix({
      fix: onRoute({ lng: 33.365 }),
      prior: [],
      shape,
    });
    expect(r.snapM).toBeGreaterThan(SNAP_HARD_M - 20);
    expect(r.score).toBeLessThan(RIDER_PHYSICS_FOLD_MIN);
  });

  it("zeros an urban car-speed ping", () => {
    const r = scoreRiderFix({
      fix: onRoute({ speedMps: URBAN_MAX_MPS + 2 }),
      prior: [],
      shape,
    });
    expect(r.score).toBe(0);
  });

  it("allows Intercity a faster cap than urban", () => {
    const urban = scoreRiderFix({
      fix: onRoute({ speedMps: 28 }),
      prior: [],
      shape,
      agency: "OS",
    });
    const ic = scoreRiderFix({
      fix: onRoute({ speedMps: 28 }),
      prior: [],
      shape,
      agency: "IC",
    });
    expect(urban.score).toBe(0);
    expect(ic.score).toBeGreaterThan(0.9);
  });

  it("zeros a teleport from the last fix", () => {
    const prior = [onRoute({ tMs: T0 - 5_000, lat: 35.17 })];
    const r = scoreRiderFix({
      fix: onRoute({ lat: 35.19, tMs: T0 }),
      prior,
      shape,
    });
    expect(r.impliedMps).not.toBeNull();
    expect(r.score).toBe(0);
  });

  it("downweights a jump backwards along the trip", () => {
    const prior = [onRoute({ lat: 35.176, tMs: T0 - 30_000, speedMps: 4 })];
    const r = scoreRiderFix({
      fix: onRoute({ lat: 35.172, tMs: T0, speedMps: 4 }),
      prior,
      shape,
    });
    expect(r.score).toBeLessThan(0.3);
  });

  it("does not punish a missing shape", () => {
    const r = scoreRiderFix({ fix: onRoute(), prior: [], shape: null });
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.snapM).toBeNull();
  });
});

describe("riderFold", () => {
  it("treats an unscored row as today's fold", () => {
    expect(riderFold(null, true)).toBe("override");
    expect(riderFold(undefined, false)).toBe("place");
  });

  it("never moves the marker below the fold floor", () => {
    expect(riderFold(RIDER_PHYSICS_FOLD_MIN - 0.01, false)).toBe("skip");
    expect(riderFold(0, true)).toBe("skip");
  });

  it("places a middling score only when the feed is empty", () => {
    const mid = (RIDER_PHYSICS_FOLD_MIN + RIDER_PHYSICS_OVERRIDE_MIN) / 2;
    expect(riderFold(mid, false)).toBe("place");
    expect(riderFold(mid, true)).toBe("skip");
  });

  it("lets a strong score overlay a stale feed ping", () => {
    expect(riderFold(RIDER_PHYSICS_OVERRIDE_MIN, true)).toBe("override");
    expect(riderFold(0.95, false)).toBe("place");
  });
});
