import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAirportPage, AIRPORT_STOP } from "../airport";

afterEach(() => vi.unstubAllGlobals());

describe("AIRPORT_STOP", () => {
  it("has stops for lca and pfo", () => {
    expect(AIRPORT_STOP.lca).toBe("6117");
    expect(AIRPORT_STOP.pfo).toBe("1813");
  });
});

describe("fetchAirportPage", () => {
  it("returns data on ok and passes code in query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ airport: {}, coachLines: [], flights: null }) });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchAirportPage("lca");
    expect(res.coachLines).toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toContain("code=lca");
  });

  it("throws on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchAirportPage("pfo")).rejects.toThrow("Airport 404");
  });

  it("rejects on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net down")));
    await expect(fetchAirportPage("lca")).rejects.toThrow("net down");
  });

  it("propagates malformed json", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad"); } }));
    await expect(fetchAirportPage("lca")).rejects.toThrow("bad");
  });
});
