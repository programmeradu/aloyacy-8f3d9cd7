import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWalkingDirections, streetViewUrl } from "@/lib/walk";
import { API_BASE } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const args = { from: { lat: 35.17, lng: 33.36 }, to: { lat: 35.18, lng: 33.37 } };

describe("fetchWalkingDirections", () => {
  it("POSTs the from/to/locale args to the walk-directions endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ directions: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWalkingDirections({ ...args, locale: "el" });

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/walk-directions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...args, locale: "el" }),
    });
  });

  it("returns the parsed directions on success", async () => {
    const directions = { steps: [], distanceMeters: 500, durationSec: 400 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ directions }), { status: 200 })),
    );

    await expect(fetchWalkingDirections(args)).resolves.toEqual({ directions });
  });

  it("returns { directions: null } instead of throwing when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 500 })));

    await expect(fetchWalkingDirections(args)).resolves.toEqual({ directions: null });
  });
});

describe("streetViewUrl", () => {
  it("builds a URL with default width, height and fov", () => {
    const url = streetViewUrl({ lat: 35.17, lng: 33.36, heading: 90 });

    expect(url).toBe(`${API_BASE}/api/public/streetview?lat=35.17&lng=33.36&heading=90&w=640&h=360&fov=85`);
  });

  it("respects overridden width, height and fov", () => {
    const url = streetViewUrl({ lat: 35.17, lng: 33.36, heading: 90, w: 800, h: 600, fov: 100 });

    expect(url).toBe(`${API_BASE}/api/public/streetview?lat=35.17&lng=33.36&heading=90&w=800&h=600&fov=100`);
  });

  it("rounds a fractional heading", () => {
    const url = streetViewUrl({ lat: 0, lng: 0, heading: 45.7 });

    expect(url).toContain("heading=46");
  });

  it("rounds a heading that is exactly at the .5 boundary up", () => {
    const url = streetViewUrl({ lat: 0, lng: 0, heading: 12.5 });

    expect(url).toContain("heading=13");
  });

  it("handles a negative heading by rounding towards zero-adjacent integer", () => {
    const url = streetViewUrl({ lat: 0, lng: 0, heading: -10.4 });

    expect(url).toContain("heading=-10");
  });
});
