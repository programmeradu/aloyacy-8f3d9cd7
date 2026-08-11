import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDustAdvisory } from "@/lib/dust";
import { API_BASE } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const args = { lat: 35.17, lng: 33.36 };

describe("fetchDustAdvisory", () => {
  it("requests the dust-advisory endpoint with lat/lng query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchDustAdvisory(args);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/public/dust-advisory?lat=${args.lat}&lng=${args.lng}`,
      { headers: { Accept: "application/json" } },
    );
  });

  it("returns the advisory when it has a severity field", async () => {
    const advisory = { zone: "nicosia", severity: "haze", headline: "Dusty" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(advisory), { status: 200 })));

    await expect(fetchDustAdvisory(args)).resolves.toEqual(advisory);
  });

  it("returns null when the JSON payload lacks a severity field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ zone: "x" }), { status: 200 })));

    await expect(fetchDustAdvisory(args)).resolves.toBeNull();
  });

  it("returns null when the JSON payload is not an object (e.g. null)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null", { status: 200 })));

    await expect(fetchDustAdvisory(args)).resolves.toBeNull();
  });

  it("returns null when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 500 })));

    await expect(fetchDustAdvisory(args)).resolves.toBeNull();
  });

  it("returns null when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(fetchDustAdvisory(args)).resolves.toBeNull();
  });
});
