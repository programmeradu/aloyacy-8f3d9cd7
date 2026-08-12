import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWalkingDirections, streetViewUrl } from "../walk";

afterEach(() => vi.unstubAllGlobals());

describe("fetchWalkingDirections", () => {
  it("returns directions on ok", async () => {
    const directions = { steps: [], distanceMeters: 100, durationSec: 60 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ directions }) }));
    const res = await fetchWalkingDirections({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } });
    expect(res.directions).toEqual(directions);
  });

  it("returns null directions on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = await fetchWalkingDirections({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } });
    expect(res).toEqual({ directions: null });
  });
});

describe("streetViewUrl", () => {
  it("builds a url with defaults for w/h/fov and rounds heading", () => {
    const url = streetViewUrl({ lat: 1.5, lng: 2.5, heading: 12.7 });
    expect(url).toContain("lat=1.5");
    expect(url).toContain("lng=2.5");
    expect(url).toContain("heading=13");
    expect(url).toContain("w=640");
    expect(url).toContain("h=360");
    expect(url).toContain("fov=85");
  });

  it("honours custom w/h/fov", () => {
    const url = streetViewUrl({ lat: 0, lng: 0, heading: 0, w: 100, h: 50, fov: 60 });
    expect(url).toContain("w=100");
    expect(url).toContain("h=50");
    expect(url).toContain("fov=60");
  });
});
