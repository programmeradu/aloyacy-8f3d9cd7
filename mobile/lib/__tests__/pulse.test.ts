import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPulseBundle, type PulseBundle } from "../pulse";
import { API_BASE } from "../api";

afterEach(() => vi.unstubAllGlobals());

function makeBundle(): PulseBundle {
  return {
    today: {
      generatedAt: Date.now(),
      theme: "calm",
      heroKey: "calm",
      date: "2024-01-01",
      weekday: { en: "Mon", el: "Δευ" },
      headline: { en: "h", el: "h" },
      lede: { en: "l", el: "l" },
      tiles: [],
      verdict: { en: "v", el: "v" },
      fact: { en: "f", el: "f", tag: "local" },
      greekWord: { el: "e", translit: "t", en: "e", meaning: "m" },
      focus: { city: "Nicosia", cityEl: "Λευκωσία", scope: "city" },
    },
    live: {
      generatedAt: Date.now(),
      windowMinutes: 60,
      observations: 10,
      onTimePct: 80,
      earlyPct: 5,
      latePct: 15,
      medianDelaySec: 30,
    },
    hourly: { generatedAt: Date.now(), nowHour: 12, buckets: [] },
    signals: {
      generatedAt: Date.now(),
      focus: { id: "nic", label: "Nicosia", labelEl: "Λευκωσία", lat: 35.17, lng: 33.36, coastal: false },
      weather: null,
      marine: null,
      air: null,
      metWarnings: null,
      cruises: null,
      flights: [],
      news: null,
      events: null,
      fixtures: null,
      traffic: null,
    },
  };
}

describe("fetchPulseBundle", () => {
  it("shapes a well-formed response with no coords (no query string)", async () => {
    const bundle = makeBundle();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => bundle });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPulseBundle();
    expect(res).toEqual(bundle);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/pulse`, {
      headers: { Accept: "application/json" },
    });
  });

  it("rounds and appends all four coordinate params when provided", async () => {
    const bundle = makeBundle();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => bundle });
    vi.stubGlobal("fetch", fetchMock);
    await fetchPulseBundle({ lat: 35.1234, lng: 33.5678, destLat: 34.999, destLng: 32.001 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`${API_BASE}/api/public/pulse?`);
    expect(url).toContain("lat=35.12");
    expect(url).toContain("lng=33.57");
    expect(url).toContain("destLat=35");
    expect(url).toContain("destLng=32");
  });

  it("includes only the coordinate params that are set", async () => {
    const bundle = makeBundle();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => bundle });
    vi.stubGlobal("fetch", fetchMock);
    await fetchPulseBundle({ lat: 35.1 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${API_BASE}/api/public/pulse?lat=35.1`);
  });

  it("treats lat/lng of 0 as set (not skipped)", async () => {
    const bundle = makeBundle();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => bundle });
    vi.stubGlobal("fetch", fetchMock);
    await fetchPulseBundle({ lat: 0, lng: 0 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${API_BASE}/api/public/pulse?lat=0&lng=0`);
  });

  it("throws with status on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await expect(fetchPulseBundle()).rejects.toThrow("Pulse 404");
  });

  it("throws with status on a 500 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchPulseBundle()).rejects.toThrow("Pulse 500");
  });

  it("propagates network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchPulseBundle()).rejects.toThrow("offline");
  });

  it("propagates malformed JSON parse errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }),
    );
    await expect(fetchPulseBundle()).rejects.toThrow("bad json");
  });

  it("passes through a partial/empty-ish payload as-is (no defensive parsing)", async () => {
    const partial = { today: {} };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => partial }));
    const res = await fetchPulseBundle();
    expect(res).toEqual(partial);
  });
});
