import { describe, expect, it } from "vitest";
import { inferMode, normaliseMode, speedBetween } from "./group-mode";

describe("group-mode", () => {
  it("accepts only known modes", () => {
    expect(normaliseMode("bus")).toBe("bus");
    expect(normaliseMode("rocket")).toBeNull();
    expect(normaliseMode(null)).toBeNull();
  });
  it("infers from speed, bus match first", () => {
    expect(inferMode({ speedKmh: null })).toBeNull();
    expect(inferMode({ speedKmh: 4 })).toBe("walk");
    expect(inferMode({ speedKmh: 15 })).toBe("bike");
    expect(inferMode({ speedKmh: 40 })).toBe("taxi");
    expect(inferMode({ speedKmh: 30, nearLiveBusM: 20 })).toBe("bus");
    expect(inferMode({ speedKmh: 1, nearLiveBusM: 20 })).toBe("walk");
  });
  it("speed between fixes, ignoring tiny or huge gaps", () => {
    const a = { lat: 35.17, lng: 33.36, atMs: 0 };
    const b = { lat: 35.171, lng: 33.36, atMs: 25_000 };
    expect(speedBetween(a, b)!).toBeGreaterThan(15);
    expect(speedBetween(a, { ...b, atMs: 1000 })).toBeNull();
  });
});
