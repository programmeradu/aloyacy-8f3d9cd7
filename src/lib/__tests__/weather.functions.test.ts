import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

let mod: typeof import("../weather.functions");
const originalLovable = process.env.LOVABLE_API_KEY;
const originalGoogle = process.env.GOOGLE_MAPS_API_KEY;

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  process.env.LOVABLE_API_KEY = "lovable-key";
  process.env.GOOGLE_MAPS_API_KEY = "google-key";
  mod = await import("../weather.functions");
});

afterEach(() => {
  process.env.LOVABLE_API_KEY = originalLovable;
  process.env.GOOGLE_MAPS_API_KEY = originalGoogle;
});

const COORDS = { lat: 35.17, lng: 33.36 };

describe("getCurrentWeather", () => {
  it("returns null when required API keys are missing", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.resetModules();
    mod = await import("../weather.functions");
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on an upstream error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(out).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(out).toBeNull();
  });

  it("maps a thunderstorm condition during the day", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        temperature: { degrees: 28.4 },
        feelsLikeTemperature: { degrees: 30.1 },
        weatherCondition: { type: "THUNDERSTORM", description: { text: "Thunderstorms" } },
        isDaytime: true,
      }),
    });
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(out?.iconKey).toBe("storm");
    expect(out?.tempC).toBe(28);
    expect(out?.feelsLikeC).toBe(30);
    expect(out?.condition).toBe("Thunderstorms");
  });

  it("maps rain, wind, and cloud conditions", async () => {
    for (const [type, expected] of [
      ["LIGHT_RAIN_SHOWERS", "rain"],
      ["WINDY", "wind"],
      ["MOSTLY_CLOUDY", "cloud"],
    ] as const) {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          temperature: { degrees: 20 },
          feelsLikeTemperature: { degrees: 20 },
          weatherCondition: { type },
          isDaytime: true,
        }),
      });
      const out = await callServerFn(mod.getCurrentWeather, COORDS);
      expect(out?.iconKey).toBe(expected);
    }
  });

  it("maps clear conditions to a moon icon at night", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        temperature: { degrees: 18 },
        feelsLikeTemperature: { degrees: 17 },
        weatherCondition: { type: "CLEAR" },
        isDaytime: false,
      }),
    });
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(out?.iconKey).toBe("moon");
    expect(out?.isDaytime).toBe(false);
  });

  it("falls back to the mapped label when no description text is given", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        temperature: { degrees: 18 },
        feelsLikeTemperature: { degrees: 17 },
        weatherCondition: { type: "UNKNOWN_CODE" },
        isDaytime: true,
      }),
    });
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(out?.condition).toBe("Clear");
  });

  it("rejects out-of-range coordinates", async () => {
    await expect(
      callServerFn(mod.getCurrentWeather, { lat: 999, lng: 0 }),
    ).rejects.toThrow();
  });
});
