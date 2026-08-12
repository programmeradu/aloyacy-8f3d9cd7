import { describe, it, expect, vi, afterEach } from "vitest";
import { itinerarySamplePoints, fetchItineraryTrafficAlerts } from "../traffic-alerts";
import { API_BASE } from "../api";
import type { Itinerary, Leg } from "../plan";

afterEach(() => vi.unstubAllGlobals());

function rideLeg(n: number): Leg {
  return {
    kind: "ride",
    routeId: `r${n}`,
    routeShort: `${n}`,
    routeLong: `Route ${n}`,
    tripId: `t${n}`,
    live: true,
    board: { stopId: `b${n}`, name: `Board ${n}`, lat: n, lng: n + 0.1, departureUnix: 1000 },
    alight: { stopId: `a${n}`, name: `Alight ${n}`, lat: n + 1, lng: n + 1.1, arrivalUnix: 2000 },
    stopCount: 3,
    delaySec: 0,
  };
}

function walkLeg(n: number): Leg {
  return {
    kind: "walk",
    from: { name: `From ${n}`, lat: n, lng: n },
    to: { name: `To ${n}`, lat: n + 1, lng: n + 1 },
    durationSec: 120,
    distanceMeters: 150,
    verified: true,
  };
}

function waitLeg(n: number): Leg {
  return { kind: "wait", stopId: `w${n}`, name: `Wait ${n}`, lat: n, lng: n, durationSec: 60 };
}

function itineraryOf(legs: Leg[]): Itinerary {
  return {
    id: "it1",
    legs,
    totalDurationSec: 1000,
    departureUnix: 1000,
    arrivalUnix: 2000,
    transfers: 0,
    totalWalkMeters: 0,
    score: 1,
    source: "live",
  };
}

describe("itinerarySamplePoints", () => {
  it("returns board+alight for ride legs", () => {
    const it = itineraryOf([rideLeg(1)]);
    expect(itinerarySamplePoints(it)).toEqual([
      { lat: 1, lng: 1.1 },
      { lat: 2, lng: 2.1 },
    ]);
  });

  it("returns from+to for walk legs", () => {
    const it = itineraryOf([walkLeg(5)]);
    expect(itinerarySamplePoints(it)).toEqual([
      { lat: 5, lng: 5 },
      { lat: 6, lng: 6 },
    ]);
  });

  it("returns a single point for wait legs", () => {
    const it = itineraryOf([waitLeg(9)]);
    expect(itinerarySamplePoints(it)).toEqual([{ lat: 9, lng: 9 }]);
  });

  it("concatenates points across mixed legs in order", () => {
    const it = itineraryOf([waitLeg(1), walkLeg(2), rideLeg(3)]);
    expect(itinerarySamplePoints(it)).toEqual([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
      { lat: 3, lng: 3.1 },
      { lat: 4, lng: 4.1 },
    ]);
  });

  it("returns an empty array for an itinerary with no legs", () => {
    expect(itinerarySamplePoints(itineraryOf([]))).toEqual([]);
  });

  it("caps the result at 64 points", () => {
    const legs = Array.from({ length: 40 }, (_, i) => rideLeg(i)); // 80 points
    const it = itineraryOf(legs);
    const pts = itinerarySamplePoints(it);
    expect(pts).toHaveLength(64);
  });
});

describe("fetchItineraryTrafficAlerts", () => {
  const points = [{ lat: 35.1, lng: 33.3 }];

  it("returns null immediately for an empty points array without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchItineraryTrafficAlerts([]);
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shapes a well-formed report with alerts and posts the sample points", async () => {
    const report = {
      highest: "high" as const,
      alerts: [
        {
          id: "a1",
          kind: "accident" as const,
          severity: "high" as const,
          road: "A1",
          headline: "Multi-car pileup",
          distanceFromPathM: 120,
          validFrom: null,
          validTo: null,
        },
      ],
      observedAt: "2024-01-01T00:00:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => report });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchItineraryTrafficAlerts(points);
    expect(res).toEqual(report);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/traffic-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ points }),
    });
  });

  it("returns null when the alerts array is empty", async () => {
    const report = { highest: "low" as const, alerts: [], observedAt: "2024-01-01T00:00:00Z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => report }));
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });

  it("returns null when alerts is missing from the payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ highest: "low" }) }),
    );
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });

  it("returns null when alerts is not an array (malformed payload)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ alerts: "oops" }) }),
    );
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });

  it("returns null when the payload itself is null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null }));
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });

  it("returns null on a 500 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });

  it("returns null (not throw) on network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });

  it("returns null (not throw) when JSON parsing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }),
    );
    await expect(fetchItineraryTrafficAlerts(points)).resolves.toBeNull();
  });
});
