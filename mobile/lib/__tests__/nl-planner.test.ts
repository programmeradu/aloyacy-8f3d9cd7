import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAskAloya } from "@/lib/nl-planner";
import * as places from "@/lib/places";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchJson(json: unknown, ok = true) {
  global.fetch = vi.fn(async () => ({
    ok,
    json: async () => json,
  })) as unknown as typeof fetch;
}

function mockGeocode(place: { lat: number; lng: number; label: string } | null) {
  vi.spyOn(places, "autocompletePlaces").mockResolvedValue(
    place ? [{ placeId: "p1", primary: place.label, secondary: "" }] : [],
  );
  vi.spyOn(places, "resolvePlace").mockResolvedValue(
    place ? { placeId: "p1", name: place.label, address: "", lat: place.lat, lng: place.lng } : (null as never),
  );
}

describe("resolveAskAloya — server parse path", () => {
  it("resolves a destination-only query using the server intent + geocoder", async () => {
    mockFetchJson({ from: null, to: "Larnaca Airport", leaveByISO: null, arriveByISO: null, confidence: 0.9 });
    mockGeocode({ lat: 34.87, lng: 33.62, label: "Larnaca Airport" });

    const result = await resolveAskAloya("take me to larnaca airport");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.seed.to).toEqual({ lat: 34.87, lng: 33.62, label: "Larnaca Airport" });
      expect(result.seed.from).toBeNull();
      expect(result.seed.rawText).toBe("take me to larnaca airport");
    }
  });

  it("treats a self-referencing origin ('home', 'my place') as null (use current location)", async () => {
    mockFetchJson({ from: "home", to: "Work", leaveByISO: null, arriveByISO: null, confidence: 0.9 });
    mockGeocode({ lat: 1, lng: 1, label: "Work" });
    const result = await resolveAskAloya("from home to work");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.seed.from).toBeNull();
  });

  it("geocodes a real named origin", async () => {
    mockFetchJson({ from: "Nicosia", to: "Limassol", leaveByISO: null, arriveByISO: null, confidence: 0.9 });
    const spyAuto = vi.spyOn(places, "autocompletePlaces");
    const spyResolve = vi.spyOn(places, "resolvePlace");
    spyAuto.mockImplementation(async ({ query }) => [{ placeId: query, primary: query, secondary: "" }]);
    spyResolve.mockImplementation(async (placeId) =>
      placeId === "Nicosia"
        ? { placeId, name: "Nicosia", address: "", lat: 35.17, lng: 33.36 }
        : { placeId, name: "Limassol", address: "", lat: 34.68, lng: 33.04 },
    );
    const result = await resolveAskAloya("from Nicosia to Limassol");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.seed.from).toEqual({ lat: 35.17, lng: 33.36, label: "Nicosia" });
      expect(result.seed.to).toEqual({ lat: 34.68, lng: 33.04, label: "Limassol" });
    }
  });

  it("fails with reason 'parse' when the server has no destination and heuristics find none either", async () => {
    mockFetchJson({ from: null, to: null, leaveByISO: null, arriveByISO: null, confidence: 0 });
    const result = await resolveAskAloya("hello there");
    expect(result).toEqual({ ok: false, reason: "parse", rawText: "hello there" });
  });

  it("fails with reason 'geocode' when the destination can't be resolved to coordinates", async () => {
    mockFetchJson({ from: null, to: "Nowhereville", leaveByISO: null, arriveByISO: null, confidence: 0.5 });
    mockGeocode(null);
    const result = await resolveAskAloya("go to nowhereville");
    expect(result).toEqual({ ok: false, reason: "geocode", rawText: "go to nowhereville", hint: "Nowhereville" });
  });

  it("falls back to the local heuristic parser when the server request throws", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    mockGeocode({ lat: 1, lng: 1, label: "Larnaca" });
    const result = await resolveAskAloya("from home to Larnaca");
    expect(result.ok).toBe(true);
  });

  it("falls back to the heuristic parser when the server responds not-ok", async () => {
    mockFetchJson({}, false);
    mockGeocode({ lat: 1, lng: 1, label: "Larnaca" });
    const result = await resolveAskAloya("to Larnaca");
    expect(result.ok).toBe(true);
  });

  it("falls back to the heuristic parser when the server response has no 'to'", async () => {
    mockFetchJson({ from: null, to: null, leaveByISO: null, arriveByISO: null, confidence: 0 });
    mockGeocode({ lat: 1, lng: 1, label: "Larnaca" });
    const result = await resolveAskAloya("to Larnaca in 10 min");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.seed.leaveByISO).not.toBeNull();
  });
});

describe("resolveAskAloya — heuristic 'in N minutes' parsing", () => {
  it("computes a leaveByISO offset from now for 'in N min' phrasing", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    mockGeocode({ lat: 1, lng: 1, label: "Somewhere" });
    const before = Date.now();
    const result = await resolveAskAloya("to somewhere in 15 min");
    expect(result.ok).toBe(true);
    if (result.ok && result.seed.leaveByISO) {
      const leaveMs = new Date(result.seed.leaveByISO).getTime();
      expect(leaveMs - before).toBeGreaterThanOrEqual(15 * 60_000 - 2000);
      expect(leaveMs - before).toBeLessThanOrEqual(15 * 60_000 + 5000);
    } else {
      throw new Error("expected leaveByISO");
    }
  });
});
