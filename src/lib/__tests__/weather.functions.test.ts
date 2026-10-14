import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

let mod: typeof import("../weather.functions");

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  mod = await import("../weather.functions");
}, 30_000);

const COORDS = { lat: 35.17, lng: 33.36 };
const om = (current: Record<string, number>) => ({ ok: true, json: async () => ({ current }) });

describe("getCurrentWeather (Open-Meteo)", () => {
  it("calls Open-Meteo with the rider's coordinates, no key", async () => {
    fetchMock.mockResolvedValue(om({ temperature_2m: 24.6, apparent_temperature: 25.2, weather_code: 0, wind_speed_10m: 8, is_day: 1 }));
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.open-meteo.com/v1/forecast?latitude=35.1700&longitude=33.3600");
    expect(out).toEqual({ tempC: 25, feelsLikeC: 25, condition: "Clear", iconKey: "sun", isDaytime: true });
  });

  it("returns null on an upstream error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    expect(await callServerFn(mod.getCurrentWeather, COORDS)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await callServerFn(mod.getCurrentWeather, COORDS)).toBeNull();
  });

  it("maps thunderstorm, rain, wind and cloud codes", async () => {
    fetchMock.mockResolvedValueOnce(om({ temperature_2m: 20, weather_code: 95, wind_speed_10m: 10, is_day: 1 }));
    expect((await callServerFn(mod.getCurrentWeather, COORDS))?.iconKey).toBe("storm");
    fetchMock.mockResolvedValueOnce(om({ temperature_2m: 20, weather_code: 61, wind_speed_10m: 10, is_day: 1 }));
    expect((await callServerFn(mod.getCurrentWeather, COORDS))?.iconKey).toBe("rain");
    fetchMock.mockResolvedValueOnce(om({ temperature_2m: 20, weather_code: 0, wind_speed_10m: 55, is_day: 1 }));
    expect((await callServerFn(mod.getCurrentWeather, COORDS))?.iconKey).toBe("wind");
    fetchMock.mockResolvedValueOnce(om({ temperature_2m: 20, weather_code: 3, wind_speed_10m: 5, is_day: 1 }));
    expect((await callServerFn(mod.getCurrentWeather, COORDS))?.iconKey).toBe("cloud");
  });

  it("shows a moon for clear nights", async () => {
    fetchMock.mockResolvedValue(om({ temperature_2m: 18, weather_code: 0, wind_speed_10m: 4, is_day: 0 }));
    const out = await callServerFn(mod.getCurrentWeather, COORDS);
    expect(out?.iconKey).toBe("moon");
    expect(out?.isDaytime).toBe(false);
  });

  it("rejects out-of-range coordinates", async () => {
    await expect(callServerFn(mod.getCurrentWeather, { lat: 200, lng: 0 })).rejects.toThrow();
  });
});
