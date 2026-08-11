import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRouteReliability, fetchStopReliability } from "@/lib/reliability";
import { API_BASE } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRouteReliability", () => {
  it("returns an empty array without calling fetch when routeIds is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRouteReliability([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the routeIds to the route-reliability endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteReliability(["1", "2"]);

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/route-reliability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ routeIds: ["1", "2"] }),
    });
  });

  it("returns the parsed reliability rows on success", async () => {
    const rows = [{ routeId: "1", onTimePct: 0.9, meanDelaySec: 30, sampleCount: 50, tier: "high" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 })));

    await expect(fetchRouteReliability(["1"])).resolves.toEqual(rows);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 500 })));

    await expect(fetchRouteReliability(["1"])).rejects.toThrow("Reliability 500");
  });
});

describe("fetchStopReliability", () => {
  it("returns null without calling fetch when stopId is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchStopReliability("", ["1"])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null without calling fetch when routeIds is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchStopReliability("s1", [])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the stopId and routeIds to the stop-reliability endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchStopReliability("s1", ["1", "2"]);

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/stop-reliability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ stopId: "s1", routeIds: ["1", "2"] }),
    });
  });

  it("truncates routeIds to the first 30 entries before sending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const routeIds = Array.from({ length: 40 }, (_, i) => `r${i}`);

    await fetchStopReliability("s1", routeIds);

    const call = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(call.body as string);
    expect(body.routeIds).toHaveLength(30);
    expect(body.routeIds).toEqual(routeIds.slice(0, 30));
  });

  it("returns the parsed stop reliability on success", async () => {
    const row = { stopId: "s1", routeIds: ["1"], onTimePct: 0.8, meanDelaySec: 60, sampleCount: 40, tier: "medium" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 200 })));

    await expect(fetchStopReliability("s1", ["1"])).resolves.toEqual(row);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 404 })));

    await expect(fetchStopReliability("s1", ["1"])).rejects.toThrow("Stop reliability 404");
  });
});
