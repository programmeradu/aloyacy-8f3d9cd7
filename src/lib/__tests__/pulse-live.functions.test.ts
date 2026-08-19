import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { pulseSignals: TableResult } = { pulseSignals: { data: [], error: null } };

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    pulse_signals: () => state.pulseSignals,
  });
  return { supabaseAdmin: client };
});

const { getPulseLive, getDustAdvisory } = await import("../pulse-live.functions");

const NICOSIA = { lat: 35.1856, lng: 33.3823 };

function signal(
  key: string,
  scope: string,
  payload: Record<string, unknown>,
  ageMs = 0,
  ttl = 3600,
) {
  return {
    key,
    scope,
    source: "test",
    payload,
    fetched_at: new Date(Date.now() - ageMs).toISOString(),
    ttl_seconds: ttl,
  };
}

describe("getPulseLive", () => {
  beforeEach(() => {
    state.pulseSignals = { data: [], error: null };
  });

  it("rejects out-of-range coordinates at the validator boundary", async () => {
    await expect(callServerFn(getPulseLive, { lat: 90, lng: 33 })).rejects.toThrow();
  });

  it("defaults to the first pulse zone when no coordinates are given", async () => {
    const out = await callServerFn(getPulseLive, undefined);
    expect(out.focus.id).toBeTruthy();
    expect(out.weather).toBeNull();
  });

  it("returns an empty bundle when the query errors", async () => {
    state.pulseSignals = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getPulseLive, NICOSIA);
    expect(out.weather).toBeNull();
    expect(out.flights).toEqual([]);
  });

  it("resolves the nearest zone and prefers zonal signals over island rollups", async () => {
    state.pulseSignals = {
      data: [
        signal("weather", "nicosia", { city: "Nicosia", tempC: 30 } as Record<string, unknown>),
        signal("weather", "island", { city: "Island", tempC: 25 } as Record<string, unknown>),
        signal("air", "island", { city: "Island", europeanAqi: 40 } as Record<string, unknown>),
        signal("met-warnings", "island", { count: 1, warnings: [], confidence: "high" }),
        signal("flights", "airport-lca", { airport: "LCLK" }),
        signal("news", "island", { count: 0, items: [], sources: [], fetchedAt: "now" }),
      ],
      error: null,
    };
    const out = await callServerFn(getPulseLive, NICOSIA);
    expect(out.focus.id).toBe("nicosia");
    expect((out.weather as { city: string } | null)?.city).toBe("Nicosia");
    expect(out.air).not.toBeNull();
    expect(out.flights).toHaveLength(1);
    expect(out.marine).toBeNull(); // nicosia is not coastal
  });

  it("drops signals past their TTL", async () => {
    state.pulseSignals = {
      data: [signal("weather", "island", { city: "Stale" }, 2 * 3600 * 1000, 3600)],
      error: null,
    };
    const out = await callServerFn(getPulseLive, NICOSIA);
    expect(out.weather).toBeNull();
  });

  it("includes marine data for coastal zones", async () => {
    state.pulseSignals = {
      data: [signal("marine", "limassol", { city: "Limassol", waveHeightM: 0.5 })],
      error: null,
    };
    const out = await callServerFn(getPulseLive, { lat: 34.7071, lng: 33.0226 });
    expect(out.focus.id).toBe("limassol");
    expect(out.marine).not.toBeNull();
  });
});

describe("getDustAdvisory", () => {
  beforeEach(() => {
    state.pulseSignals = { data: [], error: null };
  });

  it("rejects missing lat/lng at the validator boundary", async () => {
    // The helper takes the raw payload on purpose; the validator is what
    // rejects it, exactly as it would for a malformed RPC from a browser.
    await expect(callServerFn(getDustAdvisory, {})).rejects.toThrow();

  });

  it("returns null when there is no fresh air row", async () => {
    state.pulseSignals = { data: [], error: null };
    expect(await callServerFn(getDustAdvisory, NICOSIA)).toBeNull();
  });

  it("returns null when the query errors", async () => {
    state.pulseSignals = { data: null, error: { message: "boom" } };
    expect(await callServerFn(getDustAdvisory, NICOSIA)).toBeNull();
  });

  it("returns null when pm10/band are both benign", async () => {
    state.pulseSignals = {
      data: [
        {
          scope: "nicosia",
          payload: { pm10: 20, band: "good" },
          fetched_at: new Date().toISOString(),
        },
      ],
      error: null,
    };
    expect(await callServerFn(getDustAdvisory, NICOSIA)).toBeNull();
  });

  it("fires a heavy-dust advisory for very high pm10, mentioning the walk leg when long", async () => {
    state.pulseSignals = {
      data: [
        {
          scope: "nicosia",
          payload: { pm10: 250, band: "very-poor" },
          fetched_at: new Date().toISOString(),
        },
      ],
      error: null,
    };
    const out = await callServerFn(getDustAdvisory, { ...NICOSIA, walkMeters: 600 });
    expect(out?.severity).toBe("heavy-dust");
    expect(out?.advice).toContain("600 m");
  });

  it("falls back to the island rollup's `worst` zone when no zonal row exists", async () => {
    state.pulseSignals = {
      data: [
        {
          scope: "island",
          payload: { worst: { pm10: 150, band: "poor" } },
          fetched_at: new Date().toISOString(),
        },
      ],
      error: null,
    };
    const out = await callServerFn(getDustAdvisory, NICOSIA);
    expect(out?.severity).toBe("dust-front");
  });

  it("fires poor-air severity purely from band when pm10 is low", async () => {
    state.pulseSignals = {
      data: [
        {
          scope: "nicosia",
          payload: { pm10: 10, band: "poor" },
          fetched_at: new Date().toISOString(),
        },
      ],
      error: null,
    };
    const out = await callServerFn(getDustAdvisory, NICOSIA);
    expect(out?.severity).toBe("poor-air");
  });
});
