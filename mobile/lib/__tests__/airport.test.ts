import { afterEach, describe, expect, it, vi } from "vitest";
import { AIRPORT_STOP, fetchAirportPage } from "@/lib/airport";
import { API_BASE } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AIRPORT_STOP", () => {
  it("maps each supported airport code to its anchoring GTFS stop", () => {
    expect(AIRPORT_STOP).toEqual({ lca: "6117", pfo: "1813" });
  });
});

describe("fetchAirportPage", () => {
  it.each(["lca", "pfo"] as const)("requests the airport endpoint with code=%s", async (code) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ airport: {}, coachLines: [], flights: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchAirportPage(code);

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/airport?code=${code}`, {
      headers: { Accept: "application/json" },
    });
  });

  it("returns the parsed page data on success", async () => {
    const page = { airport: { code: "lca" }, coachLines: [], flights: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 })));

    await expect(fetchAirportPage("lca")).resolves.toEqual(page);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 503 })));

    await expect(fetchAirportPage("pfo")).rejects.toThrow("Airport 503");
  });
});
