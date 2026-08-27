import { describe, expect, it } from "vitest";

import { classifyFreshness, confidenceDot, thresholdsFor, tierAccent } from "./freshness";

describe("thresholdsFor", () => {
  it("relaxes the windows for the sparser intercity feed", () => {
    const ic = thresholdsFor("IC");
    const urban = thresholdsFor("NPT");
    expect(ic.fresh).toBeGreaterThan(urban.fresh);
    expect(ic.ghost).toBeGreaterThan(urban.ghost);
    expect(ic.near).toBeGreaterThan(urban.near);
  });

  it("treats an unknown or missing agency as urban", () => {
    expect(thresholdsFor(undefined)).toEqual(thresholdsFor("NPT"));
  });
});

describe("classifyFreshness", () => {
  it("falls back to scheduled with no vehicle row", () => {
    const r = classifyFreshness({ hasVehicle: false, pingAgeSec: 0 });
    expect(r).toEqual({ tier: "scheduled", confidence: "low", token: "scheduled" });
  });

  it("falls back to scheduled when the ping age is not finite", () => {
    expect(classifyFreshness({ hasVehicle: true, pingAgeSec: Infinity }).tier).toBe("scheduled");
    expect(classifyFreshness({ hasVehicle: true, pingAgeSec: NaN }).tier).toBe("scheduled");
  });

  it("calls a fresh, nearby vehicle live", () => {
    const r = classifyFreshness({
      hasVehicle: true,
      pingAgeSec: 20,
      stopsAway: 2,
      modelSamples: 12,
    });
    expect(r.tier).toBe("live");
    expect(r.token).toBe("live");
    expect(r.confidence).toBe("high");
  });

  // Sample coverage must actually move the confidence needle — a live tier
  // backed by a thin speed/dwell model is a weaker claim than one backed by
  // a dozen observed segments, and surfaces widen the band accordingly.
  it("grades live-tier confidence by how many samples back the model", () => {
    const base = { hasVehicle: true, pingAgeSec: 20, stopsAway: 2 } as const;
    expect(classifyFreshness({ ...base, modelSamples: 12 }).confidence).toBe("high");
    expect(classifyFreshness({ ...base, modelSamples: 5 }).confidence).toBe("medium");
    expect(classifyFreshness({ ...base, modelSamples: 1 }).confidence).toBe("low");
    expect(classifyFreshness(base).confidence).toBe("low");
  });

  it("never claims live for a distant bus, even on a fresh ping", () => {
    const r = classifyFreshness({ hasVehicle: true, pingAgeSec: 10, stopsAway: 40 });
    expect(r.tier).toBe("predicted");
    expect(r.token).toBe("predicted");
  });

  it("assumes the bus is far when stopsAway is unknown", () => {
    expect(classifyFreshness({ hasVehicle: true, pingAgeSec: 10 }).tier).toBe("predicted");
  });

  it("demotes an aging ping to a soft prediction before the ghost cutoff", () => {
    const r = classifyFreshness({ hasVehicle: true, pingAgeSec: 120, stopsAway: 1 });
    expect(r.tier).toBe("predicted");
    expect(r.token).toBe("stale ping");
  });

  it("demotes to ghost at the urban cutoff", () => {
    const r = classifyFreshness({
      hasVehicle: true,
      pingAgeSec: 180,
      stopsAway: 1,
      modelSamples: 500,
    });
    expect(r.tier).toBe("ghost");
    expect(r.token).toBe("no gps");
    expect(r.confidence).toBe("low");
  });

  it("still trusts the same ping age on the intercity feed", () => {
    const r = classifyFreshness({ hasVehicle: true, pingAgeSec: 180, stopsAway: 1, agency: "IC" });
    expect(r.tier).not.toBe("ghost");
  });

  it("lets a rider sighting outrank a stale feed row", () => {
    const r = classifyFreshness({ hasVehicle: true, pingAgeSec: 150, riderConfirmed: true });
    expect(r.tier).toBe("rider-confirmed");
    expect(r.token).toBe("rider");
    expect(r.confidence).toBe("medium");
  });

  it("gives a fresh rider sighting high confidence", () => {
    const r = classifyFreshness({ hasVehicle: true, pingAgeSec: 10, riderConfirmed: true });
    expect(r.confidence).toBe("high");
  });

  it("stops trusting a rider sighting past the ghost cutoff", () => {
    const r = classifyFreshness({ hasVehicle: true, pingAgeSec: 600, riderConfirmed: true });
    expect(r.tier).toBe("ghost");
  });

  it("clamps a negative ping age instead of mis-tiering", () => {
    const r = classifyFreshness({ hasVehicle: true, pingAgeSec: -30, stopsAway: 1 });
    expect(r.tier).toBe("live");
  });
});

describe("tier styling", () => {
  it("gives every tier a class", () => {
    for (const tier of ["live", "rider-confirmed", "predicted", "ghost", "scheduled"] as const) {
      expect(tierAccent(tier)).toMatch(/^text-/);
    }
  });

  it("gives every confidence level a dot class", () => {
    for (const c of ["high", "medium", "low"] as const) {
      expect(confidenceDot(c)).toMatch(/^bg-/);
    }
  });
});
