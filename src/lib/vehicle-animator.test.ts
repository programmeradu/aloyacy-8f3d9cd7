import { describe, it, expect, beforeEach, vi } from "vitest";
import { VehicleAnimator } from "./vehicle-animator";

describe("VehicleAnimator", () => {
  beforeEach(() => {
    vi.spyOn(performance, "now").mockReturnValue(0);
  });

  it("returns null pose for an unknown vehicle", () => {
    const a = new VehicleAnimator();
    expect(a.getPose("nope")).toBeNull();
  });

  it("jumps straight to target on first sighting (no prior 'from')", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(1000);
    a.setTarget({ id: "v1", lat: 10, lng: 20, bearingDeg: 90, speedMps: 5, recordedAt: 1000 });
    (performance.now as any).mockReturnValue(1000);
    const pose = a.getPose("v1")!;
    expect(pose.lat).toBeCloseTo(10);
    expect(pose.lng).toBeCloseTo(20);
    expect(pose.bearingDeg).toBeCloseTo(90);
  });

  it("tweens smoothly between two targets over the interval-derived duration", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 5, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 1, lng: 1, bearingDeg: 90, speedMps: 5, recordedAt: 3000 });
    // Halfway through the tween.
    (performance.now as any).mockReturnValue(1500);
    const mid = a.getPose("v1")!;
    expect(mid.catchingUp).toBe(true);
    expect(mid.lat).toBeGreaterThan(0);
    expect(mid.lat).toBeLessThan(1);
    // Cubic-out overshoots past linear halfway.
    expect(mid.lat).toBeGreaterThan(0.5);
  });

  it("reaches the exact target once the tween completes", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 5, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 1, lng: 1, bearingDeg: 90, speedMps: 5, recordedAt: 800 });
    (performance.now as any).mockReturnValue(800);
    const pose = a.getPose("v1")!;
    expect(pose.lat).toBeCloseTo(1, 6);
    expect(pose.lng).toBeCloseTo(1, 6);
    expect(pose.catchingUp).toBe(false);
  });

  it("extrapolates forward along bearing at capped speed after the tween ends", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 5, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    // Bearing 0 = due north; speed 5 m/s, interval clamps duration to min 800ms.
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 5, recordedAt: 800 });
    (performance.now as any).mockReturnValue(800 + 1000); // 1s into extrapolation
    const pose = a.getPose("v1")!;
    expect(pose.lat).toBeGreaterThan(0); // moved north
    expect(pose.lng).toBeCloseTo(0, 9);
    expect(pose.catchingUp).toBe(false);
  });

  it("caps extrapolation at the extrapolation budget (holds position after that)", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 10, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 10, recordedAt: 800 });
    (performance.now as any).mockReturnValue(800 + 1500); // exactly at budget
    const atBudget = a.getPose("v1")!;
    (performance.now as any).mockReturnValue(800 + 10000); // way past budget
    const wayPast = a.getPose("v1")!;
    expect(wayPast.lat).toBeCloseTo(atBudget.lat, 9);
    expect(wayPast.lng).toBeCloseTo(atBudget.lng, 9);
  });

  it("caps speed at the speed ceiling for extrapolation distance", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 1000, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 1000, recordedAt: 800 });
    (performance.now as any).mockReturnValue(800 + 1000);
    const capped = a.getPose("v1")!;

    const b = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    b.setTarget({ id: "v2", lat: 0, lng: 0, bearingDeg: 0, speedMps: 14, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    b.setTarget({ id: "v2", lat: 0, lng: 0, bearingDeg: 0, speedMps: 14, recordedAt: 800 });
    (performance.now as any).mockReturnValue(800 + 1000);
    const atCeiling = b.getPose("v2")!;

    expect(capped.lat).toBeCloseTo(atCeiling.lat, 9);
  });

  it("defaults a null bearing to 0", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 5, lng: 5, bearingDeg: null, speedMps: null, recordedAt: 0 });
    const pose = a.getPose("v1")!;
    expect(pose.bearingDeg).toBe(0);
  });

  it("eases bearing along the shortest arc across the 0/360 wrap", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 350, speedMps: 5, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 10, speedMps: 5, recordedAt: 2000 });
    (performance.now as any).mockReturnValue(1000); // halfway
    const mid = a.getPose("v1")!;
    // Shortest arc from 350 -> 10 passes through 0/360, not backward through 180.
    expect(mid.bearingDeg === 0 || (mid.bearingDeg > 350 || mid.bearingDeg < 10)).toBe(true);
  });

  it("removes a vehicle's track so subsequent lookups return null", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 5, recordedAt: 0 });
    a.remove("v1");
    expect(a.getPose("v1")).toBeNull();
  });

  it("clamps the tween duration between 800ms and 4000ms based on ping interval", () => {
    const a = new VehicleAnimator();
    (performance.now as any).mockReturnValue(0);
    a.setTarget({ id: "v1", lat: 0, lng: 0, bearingDeg: 0, speedMps: 5, recordedAt: 0 });
    (performance.now as any).mockReturnValue(0);
    // Huge interval (10s) should clamp the tween to 4000ms, not run forever.
    a.setTarget({ id: "v1", lat: 1, lng: 0, bearingDeg: 0, speedMps: 5, recordedAt: 10_000 });
    (performance.now as any).mockReturnValue(4000);
    const pose = a.getPose("v1")!;
    expect(pose.catchingUp).toBe(false);
    expect(pose.lat).toBeCloseTo(1, 6);
  });
});
