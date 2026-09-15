import { describe, it, expect } from "vitest";
import {
  computePingGapThresholds,
  MIN_GAP_SAMPLES,
  type PingGapThresholds,
} from "./ping-gap-stats";

describe("computePingGapThresholds", () => {
  it("returns null when sample count is below MIN_GAP_SAMPLES", () => {
    const gaps = Array.from({ length: MIN_GAP_SAMPLES - 1 }, (_, i) => 30 + i);
    expect(computePingGapThresholds(gaps, "urban")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(computePingGapThresholds([], "IC")).toBeNull();
  });

  it("computes correct p75/p95 for a uniform distribution", () => {
    // 100 gaps from 10 to 109 (uniform, step=1).
    // p75 = value at rank 74.25 → 10 + 74.25 = 84.25 → clamped to [30, 120] = 84
    // p95 = value at rank 94.05 → 10 + 94.05 = 104.05 → clamped to [120, 600] = 120
    const gaps = Array.from({ length: 100 }, (_, i) => 10 + i);
    const result = computePingGapThresholds(gaps, "urban");
    expect(result).not.toBeNull();
    expect(result!.freshSec).toBe(84);
    expect(result!.ghostSec).toBe(120); // clamped up from 104
    expect(result!.sampleCount).toBe(100);
    expect(result!.agency).toBe("urban");
    expect(result!.routeId).toBeUndefined();
  });

  it("computes correct values for Intercity-like ping cadence", () => {
    // IC buses ping every 60-180s typically, with occasional 300+ gaps.
    // Simulate: 80 normal pings (60-120s) + 15 slow (180-240s) + 5 very slow (300-400s)
    const normal = Array.from({ length: 80 }, (_, i) => 60 + (i % 60));
    const slow = Array.from({ length: 15 }, (_, i) => 180 + i * 4);
    const verySlow = Array.from({ length: 5 }, (_, i) => 300 + i * 20);
    const gaps = [...normal, ...slow, ...verySlow];

    const result = computePingGapThresholds(gaps, "IC", "IC:45");
    expect(result).not.toBeNull();
    expect(result!.agency).toBe("IC");
    expect(result!.routeId).toBe("IC:45");
    expect(result!.sampleCount).toBe(100);
    // p75 should be somewhere in the normal-to-slow range
    expect(result!.freshSec).toBeGreaterThanOrEqual(30);
    expect(result!.freshSec).toBeLessThanOrEqual(120);
    // p95 should capture the slow tail
    expect(result!.ghostSec).toBeGreaterThanOrEqual(120);
    expect(result!.ghostSec).toBeLessThanOrEqual(600);
  });

  it("clamps fresh to [30, 120] when data has very fast pings", () => {
    // All pings at 5-second intervals — p75 would be ~5s, clamped to 30
    const gaps = Array.from({ length: 100 }, () => 5);
    const result = computePingGapThresholds(gaps, "urban");
    expect(result).not.toBeNull();
    expect(result!.freshSec).toBe(30); // clamped up
    expect(result!.ghostSec).toBe(120); // clamped up
  });

  it("clamps ghost to 600 when data has very slow pings", () => {
    // All pings at 900-second intervals — p95 would be ~900s, clamped to 600
    const gaps = Array.from({ length: 100 }, () => 900);
    const result = computePingGapThresholds(gaps, "IC");
    expect(result).not.toBeNull();
    expect(result!.freshSec).toBe(120); // clamped down from 900
    expect(result!.ghostSec).toBe(600); // clamped down from 900
  });

  it("does not mutate the input array", () => {
    const gaps = [100, 50, 200, 150, 80, ...Array.from({ length: 95 }, () => 90)];
    const copy = [...gaps];
    computePingGapThresholds(gaps, "urban");
    expect(gaps).toEqual(copy);
  });

  it("handles exactly MIN_GAP_SAMPLES observations", () => {
    const gaps = Array.from({ length: MIN_GAP_SAMPLES }, (_, i) => 40 + i * 2);
    const result = computePingGapThresholds(gaps, "urban");
    expect(result).not.toBeNull();
    expect(result!.sampleCount).toBe(MIN_GAP_SAMPLES);
  });

  it("ensures ghost >= fresh (ghost clamp floor >= fresh clamp ceiling)", () => {
    // Mixed data where raw p75 and p95 are close together
    const gaps = Array.from({ length: 100 }, (_, i) => 60 + (i % 10));
    const result = computePingGapThresholds(gaps, "urban");
    expect(result).not.toBeNull();
    // ghost should always be >= fresh due to clamping: ghost min is 120
    expect(result!.ghostSec).toBeGreaterThanOrEqual(result!.freshSec);
  });
});
