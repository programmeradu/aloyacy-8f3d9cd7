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
});
