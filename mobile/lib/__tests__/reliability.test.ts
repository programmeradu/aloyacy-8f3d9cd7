import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRouteReliability, fetchStopReliability } from "../reliability";

afterEach(() => vi.unstubAllGlobals());

describe("fetchRouteReliability", () => {
  it("returns [] without calling fetch for an empty routeIds list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchRouteReliability([]);
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the shaped rows on ok", async () => {
    const rows = [{ routeId: "1", onTimePct: 0.9, meanDelaySec: 30, sampleCount: 50, tier: "high" as const }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => rows }));
    const res = await fetchRouteReliability(["1"]);
    expect(res).toEqual(rows);
  });

  it("throws a status-tagged error on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchRouteReliability(["1"])).rejects.toThrow("Reliability 500");
  });
});

describe("fetchStopReliability", () => {
  it("returns null without calling fetch when stopId is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchStopReliability("", ["1"]);
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null without calling fetch when routeIds is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchStopReliability("s1", []);
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps routeIds at 30 in the request body", async () => {
    const routeIds = Array.from({ length: 40 }, (_, i) => String(i));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    await fetchStopReliability("s1", routeIds);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.routeIds).toHaveLength(30);
    expect(body.stopId).toBe("s1");
  });

  it("returns the shaped row on ok", async () => {
    const row = { stopId: "s1", routeIds: ["1"], onTimePct: 0.8, meanDelaySec: 20, sampleCount: 40, tier: "medium" as const };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => row }));
    const res = await fetchStopReliability("s1", ["1"]);
    expect(res).toEqual(row);
  });

  it("throws a status-tagged error on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchStopReliability("s1", ["1"])).rejects.toThrow("Stop reliability 404");
  });
});
