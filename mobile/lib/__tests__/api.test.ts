import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPublicApi, fetchRealtime, fetchStopsBundle, API_BASE, API_BASES } from "../api";

afterEach(() => vi.unstubAllGlobals());

describe("api bases", () => {
  it("has custom domain first, lovable origin second, deduped", () => {
    expect(API_BASES[0]).toBe(API_BASE);
    expect(API_BASES).toContain("https://aloyacy.lovable.app");
    expect(new Set(API_BASES).size).toBe(API_BASES.length);
  });
});

describe("fetchPublicApi", () => {
  it("returns first ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPublicApi("/x");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry ordinary 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 404, ok: false });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPublicApi("/x");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries fallback base on 500", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 500, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPublicApi("/x");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries fallback base on network rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("dns fail"))
      .mockResolvedValueOnce({ status: 200, ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPublicApi("/x");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws last error when all bases fail", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicApi("/x")).rejects.toThrow("boom");
  });

  it("throws generic error when non-Error rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValue("string error");
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicApi("/x")).rejects.toThrow("Aloya services are temporarily unavailable");
  });
});

describe("fetchRealtime", () => {
  it("shapes response on ok", async () => {
    const snapshot = { fetchedAt: 1, vehicles: [], arrivals: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => snapshot }));
    const res = await fetchRealtime();
    expect(res).toEqual(snapshot);
  });

  it("throws its own error on a non-retried 4xx", async () => {
    // 4xx is returned immediately by fetchPublicApi (no retry across bases),
    // so fetchRealtime's own status-aware error message surfaces.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }));
    await expect(fetchRealtime()).rejects.toThrow("Realtime 404");
  });

  it("throws the aggregate fetchPublicApi error once every base 5xxs", async () => {
    // A 5xx is retried across every base; once all are exhausted,
    // fetchPublicApi's own aggregate error wins, not fetchRealtime's.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 503, ok: false, json: async () => ({}) }));
    await expect(fetchRealtime()).rejects.toThrow("returned 503");
  });

  it("propagates malformed JSON errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => { throw new Error("bad json"); } }),
    );
    await expect(fetchRealtime()).rejects.toThrow("bad json");
  });
});

describe("fetchStopsBundle", () => {
  it("normalizes array routes to a map", async () => {
    const raw = {
      stops: [{ id: "1", code: "A", name: "Stop", lat: 1, lng: 2, agency: "urban" }],
      routes: [{ id: "r1", short: "1", long: "One", color: "red", feedId: 1, type: 3 }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => raw }));
    const res = await fetchStopsBundle();
    expect(res.routes.r1.short).toBe("1");
    expect(res.stops).toEqual(raw.stops);
  });

  it("passes through map-shaped routes", async () => {
    const raw = { stops: [], routes: { r1: { short: "1", long: "One", color: "red", feedId: 1, type: 3 } } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => raw }));
    const res = await fetchStopsBundle();
    expect(res.routes).toEqual(raw.routes);
  });

  it("defaults routes to {} when missing/null", async () => {
    const raw = { stops: [], routes: null as unknown as Record<string, never> };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => raw }));
    const res = await fetchStopsBundle();
    expect(res.routes).toEqual({});
  });

  it("throws its own error on a non-retried 4xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
    await expect(fetchStopsBundle()).rejects.toThrow("Stops 404");
  });

  it("throws the aggregate fetchPublicApi error once every base 5xxs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false }));
    await expect(fetchStopsBundle()).rejects.toThrow("returned 500");
  });
});
