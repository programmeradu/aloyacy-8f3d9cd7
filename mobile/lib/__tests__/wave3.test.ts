import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchIntercityInsights,
  fetchLastMileChain,
  fetchBikeShare,
  fetchBoltScooter,
} from "../wave3";
import { API_BASE } from "../api";

afterEach(() => vi.unstubAllGlobals());

describe("fetchIntercityInsights", () => {
  it("shapes a well-formed response and encodes the routeId", async () => {
    const payload = {
      routeId: "30",
      tier: "rated" as const,
      baselineMeanDelaySec: 60,
      sampleCount: 500,
      weekdayMeanDelaySec: 70,
      weekendMeanDelaySec: 40,
      bestWindow: { dayOfWeek: 0, hourOfDay: 9, meanDelaySec: 10, sampleCount: 5 },
      worstWindow: { dayOfWeek: 1, hourOfDay: 8, meanDelaySec: 200, sampleCount: 5 },
      anomalies: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchIntercityInsights("30 X/Y");
    expect(res).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/public/intercity-intel?routeId=30%20X%2FY`,
      { headers: { Accept: "application/json" } },
    );
  });

  it("throws with status on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await expect(fetchIntercityInsights("30")).rejects.toThrow("Intel 404");
  });

  it("throws with status on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchIntercityInsights("30")).rejects.toThrow("Intel 500");
  });

  it("propagates network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net down")));
    await expect(fetchIntercityInsights("30")).rejects.toThrow("net down");
  });

  it("passes through a partial payload untouched", async () => {
    const partial = { routeId: "30", tier: "unknown" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => partial }));
    const res = await fetchIntercityInsights("30");
    expect(res).toEqual(partial);
  });
});

describe("fetchLastMileChain", () => {
  const args = {
    alight: { lat: 35.1, lng: 33.3, name: "Stop" },
    destination: { lat: 35.2, lng: 33.4, name: "Home" },
  };

  it("shapes a well-formed suggestion and posts the body", async () => {
    const suggestion = {
      trigger: "long-walk" as const,
      drivingSec: 300,
      distanceMeters: 2000,
      walkSec: 900,
      fareLow: 4,
      fareHigh: 7,
      isNightRate: false,
      fromName: "Stop",
      toName: "Home",
      boltDeepLink: "bolt://x",
      mapsDeepLink: "maps://x",
      telDispatcher: "tel:123",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => suggestion });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchLastMileChain(args);
    expect(res).toEqual(suggestion);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/last-mile-chain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
  });

  it("returns null on a non-ok response (no throw)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await expect(fetchLastMileChain(args)).resolves.toBeNull();
  });

  it("returns null on a 500 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchLastMileChain(args)).resolves.toBeNull();
  });

  it("propagates network rejection (not swallowed)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchLastMileChain(args)).rejects.toThrow("offline");
  });

  it("propagates malformed JSON parse errors on an ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }),
    );
    await expect(fetchLastMileChain(args)).rejects.toThrow("bad json");
  });
});

describe("fetchBikeShare", () => {
  const args = { from: { lat: 35.1, lng: 33.3 }, to: { lat: 35.2, lng: 33.4 }, busOnlyDurationSec: 600 };

  it("shapes a well-formed suggestion", async () => {
    const suggestion = {
      pickup: { uid: 1, number: 1, name: "A", lat: 35.1, lng: 33.3, bikes: 3, freeRacks: 2, cityId: "nic", cityName: "Nicosia", distanceM: 50, walkSec: 40 },
      dropoff: { uid: 2, number: 2, name: "B", lat: 35.2, lng: 33.4, bikes: 1, freeRacks: 4, cityId: "nic", cityName: "Nicosia", distanceM: 60, walkSec: 45 },
      rideSec: 300,
      rideMeters: 1200,
      totalSec: 400,
      busOnlySec: 600,
      savingsSec: 200,
      reason: "faster" as const,
      cityName: "Nicosia",
      webDeepLink: "https://x",
      mapsDeepLink: "maps://x",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => suggestion });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchBikeShare(args);
    expect(res).toEqual(suggestion);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/bike-share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
  });

  it("returns null on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));
    await expect(fetchBikeShare(args)).resolves.toBeNull();
  });

  it("returns null on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchBikeShare(args)).resolves.toBeNull();
  });

  it("propagates network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("dns fail")));
    await expect(fetchBikeShare(args)).rejects.toThrow("dns fail");
  });

  it("omits busOnlyDurationSec from the body when not provided", async () => {
    const minimalArgs = { from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    await fetchBikeShare(minimalArgs);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual(minimalArgs);
    expect("busOnlyDurationSec" in body).toBe(false);
  });
});

describe("fetchBoltScooter", () => {
  const args = { from: { lat: 35.1, lng: 33.3 }, to: { lat: 35.2, lng: 33.4 } };

  it("shapes a well-formed suggestion (no-bus-only reason branch)", async () => {
    const suggestion = {
      pickup: { identifier: "z1", name: "Zone 1", lat: 35.1, lng: 33.3, capacity: 10, distanceM: 30, walkSec: 25 },
      dropoff: { identifier: "z2", name: "Zone 2", lat: 35.2, lng: 33.4, capacity: 8, distanceM: 40, walkSec: 30 },
      rideSec: 180,
      rideMeters: 900,
      totalSec: 210,
      busOnlySec: null,
      savingsSec: 0,
      reason: "no-bus-only" as const,
      appDeepLink: "bolt://scooter",
      mapsDeepLink: "maps://x",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => suggestion });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchBoltScooter(args);
    expect(res).toEqual(suggestion);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/bolt-scooter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
  });

  it("returns null on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({}) }));
    await expect(fetchBoltScooter(args)).resolves.toBeNull();
  });

  it("returns null on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchBoltScooter(args)).resolves.toBeNull();
  });

  it("propagates network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(fetchBoltScooter(args)).rejects.toThrow("timeout");
  });
});
