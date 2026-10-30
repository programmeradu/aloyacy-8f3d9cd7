import { describe, expect, it } from "vitest";
import { KinematicBusEngine, EASE } from "./kinematic-engine";

describe("KinematicBusEngine", () => {
  const initialPos = { lat: 35.17, lng: 33.36 };
  const initialBearing = 90;

  it("initializes with starting position and bearing", () => {
    const engine = new KinematicBusEngine(initialPos, initialBearing);
    expect(engine.getPos()).toEqual(initialPos);
    expect(engine.isBoarding()).toBe(false);
  });

  it("calculates EASE function curve correctly", () => {
    expect(EASE(0)).toBe(0);
    expect(EASE(0.5)).toBe(0.5);
    expect(EASE(1)).toBe(1);
  });

  it("glides smoothly in off-path lerp mode", () => {
    const engine = new KinematicBusEngine(initialPos, 0);
    const targetPos = { lat: 35.18, lng: 33.37 };
    const now = 1000;

    engine.setTarget(targetPos.lat, targetPos.lng, 45, now, 10);
    expect(engine.isBoarding()).toBe(false);

    engine.tick(now);
    const midState = engine.tick(now + 2000);
    expect(midState.lat).toBeGreaterThan(initialPos.lat);
    expect(midState.lat).toBeLessThan(targetPos.lat);
    expect(midState.bearing).toBeGreaterThanOrEqual(0);
  });

  it("snaps and dead-reckons along a road polyline", () => {
    const polyline = [
      { lat: 35.17, lng: 33.36 },
      { lat: 35.175, lng: 33.36 },
      { lat: 35.18, lng: 33.36 },
    ];
    const engine = new KinematicBusEngine(initialPos, 0);
    engine.setPath(polyline);

    const debug = engine.getDebug(1000);
    expect(debug.hasPath).toBe(true);
    expect(debug.pathTotalM).toBeGreaterThan(500);

    engine.setTarget(35.172, 33.36, 0, 1000, 15);
    const nextState = engine.tick(1100);
    expect(nextState.lat).toBeGreaterThanOrEqual(35.17);
    expect(nextState.boarding).toBe(false);
  });

  it("primes with initial telemetry safely", () => {
    const engine = new KinematicBusEngine(initialPos, 90);
    engine.prime(35.17, 33.36, 90, 1000, 12345, 0);
    expect(engine.getLastTs()).toBe(12345);
    expect(engine.isBoarding()).toBe(true);
  });

  it("glides along the road shape between fixes and never past the next fix", () => {
    // An L-shaped road: north 556 m, then east.
    const road = [
      { lat: 35.17, lng: 33.36 },
      { lat: 35.175, lng: 33.36 },
      { lat: 35.175, lng: 33.366 },
    ];
    const engine = new KinematicBusEngine({ lat: 35.17, lng: 33.36 }, 0);
    engine.setPath(road);
    engine.prime(35.17, 33.36, 0, 0, 1000, 0);
    // Next fix 20 s later, round the corner on the east leg.
    engine.setTarget(35.175, 33.362, 90, 0, 0, 1020);
    const mid = engine.tick(10_000);
    // Halfway in time, the bus is ON the road (north leg or corner), not cutting the corner.
    const onNorthLeg = Math.abs(mid.lng - 33.36) < 1e-5;
    const onEastLeg = Math.abs(mid.lat - 35.175) < 1e-5;
    expect(onNorthLeg || onEastLeg).toBe(true);
    // Long after the glide, dead reckoning stays within its cap past the fix.
    let s2 = engine.tick(20_000);
    for (let t = 20_100; t <= 60_000; t += 100) s2 = engine.tick(t);
    const fixAlong = engine.getDebug(60_000).alongM;
    expect(fixAlong).toBeLessThan(556 + 182 + 61);
    expect(s2.lat).toBeCloseTo(35.175, 4);
  });

  it("holds instead of sliding back when a fix lands just behind the bus", () => {
    const road = [
      { lat: 35.17, lng: 33.36 },
      { lat: 35.18, lng: 33.36 },
    ];
    const engine = new KinematicBusEngine({ lat: 35.17, lng: 33.36 }, 0);
    engine.setPath(road);
    engine.prime(35.17, 33.36, 0, 0, 1000, 0);
    engine.setTarget(35.172, 33.36, 0, 0, 0, 1020);
    for (let t = 0; t <= 30_000; t += 100) engine.tick(t);
    const ahead = engine.getDebug(30_000).alongM;
    engine.setTarget(35.1719, 33.36, 0, 30_000, 0, 1040);
    for (let t = 30_000; t <= 40_000; t += 100) engine.tick(t);
    expect(engine.getDebug(40_000).alongM).toBeGreaterThanOrEqual(ahead - 0.01);
  });
});
