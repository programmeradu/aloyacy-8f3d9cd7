import { describe, it, expect } from "vitest";
import { C, BG, pickBg, pickPlanBg } from "./shareCard-theme";

describe("shareCard-theme palette", () => {
  it("exposes hex colors for every brand token", () => {
    for (const value of Object.values(C)) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("has a background entry for every key referenced by BG", () => {
    for (const key of Object.keys(BG)) {
      const bg = BG[key];
      expect(bg.src).toBeTruthy();
      expect(["warm", "cool", "neutral"]).toContain(bg.mood);
    }
  });
});

describe("pickBg", () => {
  it("selects a mountain backdrop for mountain-region stop names", () => {
    const bg = pickBg({ id: "s1", name: "Troodos square", agency: "urban" });
    expect(bg).toBe(BG.mountain);
  });

  it("selects the harbor backdrop for Paphos-related stop names", () => {
    const bg = pickBg({ id: "s2", name: "Kato Paphos harbour", agency: "urban" });
    expect(bg).toBe(BG.harborNight);
  });

  it("selects coastRoad for intercity agency regardless of name", () => {
    const bg = pickBg({ id: "s3", name: "Random Stop", agency: "IC" });
    expect(bg).toBe(BG.coastRoad);
  });

  it("is deterministic for the same stop id/name/agency", () => {
    const stop = { id: "stable-id-1", name: "Unrecognised Stop Name", agency: "urban" };
    const a = pickBg(stop);
    const b = pickBg(stop);
    expect(a).toBe(b);
  });

  it("returns a valid Bg object for every stop", () => {
    const bg = pickBg({ id: "x", name: "Nowhere in particular", agency: "urban" });
    expect(Object.values(BG)).toContain(bg);
  });
});

describe("pickPlanBg", () => {
  it("selects the old-town backdrop for Nicosia destinations", () => {
    expect(pickPlanBg("Nicosia")).toBe(BG.oldtown);
  });

  it("selects coastRoad for Limassol destinations", () => {
    expect(pickPlanBg("Limassol")).toBe(BG.coastRoad);
  });

  it("selects mountain backdrop for Troodos destinations", () => {
    expect(pickPlanBg("Troodos")).toBe(BG.mountain);
  });

  it("is deterministic for repeated calls with the same destination", () => {
    const a = pickPlanBg("Some Unknown Village");
    const b = pickPlanBg("Some Unknown Village");
    expect(a).toBe(b);
  });
});
