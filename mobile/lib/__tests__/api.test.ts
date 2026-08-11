import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, API_BASES, fetchPublicApi, fetchRealtime, fetchStopsBundle } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API_BASES", () => {
  it("puts the custom domain first and the lovable origin second", () => {
    expect(API_BASES[0]).toBe(API_BASE);
    expect(API_BASES).toContain("https://aloyacy.lovable.app");
  });

  it("de-duplicates bases when they happen to be equal", () => {
    expect(new Set(API_BASES).size).toBe(API_BASES.length);
  });
});

describe("fetchPublicApi", () => {
  it("returns the response from the first base when it succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchPublicApi("/api/public/x");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASES[0]}/api/public/x`, undefined);
  });

  it("returns immediately on a 4xx response without trying the second base", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchPublicApi("/api/public/x");

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls through to the second base on a 5xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchPublicApi("/api/public/x");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${API_BASES[0]}/api/public/x`, undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${API_BASES[1]}/api/public/x`, undefined);
  });

  it("falls through to the second base when the first base throws a network error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchPublicApi("/api/public/x");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws the last error when every base returns 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom1", { status: 500 }))
      .mockResolvedValueOnce(new Response("boom2", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicApi("/api/public/x")).rejects.toThrow(
      `${API_BASES[1]} returned 503`,
    );
  });

  it("throws the last error when every base throws a network error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("dns fail"))
      .mockRejectedValueOnce(new TypeError("timeout"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicApi("/api/public/x")).rejects.toThrow("timeout");
  });

  it("wraps a non-Error rejection in a generic unavailable error", async () => {
    const fetchMock = vi.fn().mockRejectedValue("plain string failure");
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicApi("/api/public/x")).rejects.toThrow(
      "Aloya services are temporarily unavailable",
    );
  });

  it("forwards the init options (method, headers, body) to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };

    await fetchPublicApi("/api/public/y", init);

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASES[0]}/api/public/y`, init);
  });
});

describe("fetchRealtime", () => {
  it("returns the parsed JSON snapshot on success", async () => {
    const snapshot = { fetchedAt: 1, vehicles: [], arrivals: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 })),
    );

    await expect(fetchRealtime()).resolves.toEqual(snapshot);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 404 })));

    await expect(fetchRealtime()).rejects.toThrow("Realtime 404");
  });
});

describe("fetchStopsBundle", () => {
  it("passes through a routes map untouched", async () => {
    const body = {
      stops: [{ id: "1", code: "A", name: "Stop A", lat: 0, lng: 0, agency: "x" }],
      routes: { r1: { short: "1", long: "Route 1", color: "red", feedId: 1, type: 3 } },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));

    const result = await fetchStopsBundle();

    expect(result.routes).toEqual(body.routes);
    expect(result.stops).toEqual(body.stops);
  });

  it("normalizes an array of routes keyed by id into a map", async () => {
    const body = {
      stops: [],
      routes: [{ id: "r1", short: "1", long: "Route 1", color: "red", feedId: 1, type: 3 }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));

    const result = await fetchStopsBundle();

    expect(result.routes).toEqual({
      r1: { id: "r1", short: "1", long: "Route 1", color: "red", feedId: 1, type: 3 },
    });
  });

  it("defaults routes to an empty object when routes is missing", async () => {
    const body = { stops: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));

    const result = await fetchStopsBundle();

    expect(result.routes).toEqual({});
  });

  it("throws a descriptive error when the response is not ok", async () => {
    // A 4xx short-circuits fetchPublicApi's base failover; a 5xx here would
    // instead surface fetchPublicApi's own "<base> returned 500" error once
    // every base is exhausted, so use a 4xx to exercise this module's own
    // not-ok handling.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 400 })));

    await expect(fetchStopsBundle()).rejects.toThrow("Stops 400");
  });
});
