import { describe, it, expect, vi } from "vitest";
import {
  classifyWmoCode,
  computeLeaveAdjustment,
  fetchCurrentWeather,
} from "./leave-time-adjuster";

describe("classifyWmoCode", () => {
  it("returns unknown for null/undefined", () => {
    expect(classifyWmoCode(null)).toBe("unknown");
    expect(classifyWmoCode(undefined)).toBe("unknown");
  });
  it("classifies clear/cloudy", () => {
    expect(classifyWmoCode(0)).toBe("clear");
    expect(classifyWmoCode(1)).toBe("cloudy");
    expect(classifyWmoCode(3)).toBe("cloudy");
  });
  it("classifies fog", () => {
    expect(classifyWmoCode(45)).toBe("fog");
    expect(classifyWmoCode(48)).toBe("fog");
  });
  it("classifies rain-light and rain-heavy", () => {
    for (const c of [51, 53, 55, 56, 57, 61, 63, 80, 81])
      expect(classifyWmoCode(c)).toBe("rain-light");
    for (const c of [65, 66, 67, 82]) expect(classifyWmoCode(c)).toBe("rain-heavy");
  });
  it("classifies snow and thunder", () => {
    for (const c of [71, 73, 75, 77, 85, 86]) expect(classifyWmoCode(c)).toBe("snow");
    for (const c of [95, 96, 99]) expect(classifyWmoCode(c)).toBe("thunder");
  });
  it("falls back to unknown for unmapped codes", () => {
    expect(classifyWmoCode(4)).toBe("unknown");
    expect(classifyWmoCode(200)).toBe("unknown");
  });
});

describe("computeLeaveAdjustment", () => {
  it("returns zeros for clear weather with no delays", () => {
    const r = computeLeaveAdjustment({ routeIds: ["R1"], weather: "clear" });
    expect(r.extraSec).toBe(0);
    expect(r.weatherSec).toBe(0);
    expect(r.trafficSec).toBe(0);
    expect(r.reasonShort).toBeNull();
  });

  it("uses static buffer for unknown weather (no reaction)", () => {
    const r = computeLeaveAdjustment({ routeIds: ["R1"], weather: "unknown" });
    expect(r.weatherSec).toBe(0);
  });

  it("applies static rain-light buffer with no coupling data", () => {
    const r = computeLeaveAdjustment({ routeIds: ["R1"], weather: "rain-light" });
    expect(r.weatherSec).toBe(120);
    expect(r.extraSec).toBe(120);
    expect(r.reasonShort).toBe("light rain · +2 min");
  });

  it("applies static rain-heavy/snow/thunder/fog buffers", () => {
    expect(computeLeaveAdjustment({ routeIds: [], weather: "rain-heavy" }).weatherSec).toBe(300);
    expect(computeLeaveAdjustment({ routeIds: [], weather: "snow" }).weatherSec).toBe(420);
    expect(computeLeaveAdjustment({ routeIds: [], weather: "thunder" }).weatherSec).toBe(240);
    expect(computeLeaveAdjustment({ routeIds: [], weather: "fog" }).weatherSec).toBe(90);
  });

  it("fog buffer of 90s doesn't hit the 60s reason threshold... wait it does", () => {
    const r = computeLeaveAdjustment({ routeIds: [], weather: "fog" });
    expect(r.reasonShort).toBe("fog · +2 min");
  });

  it("prefers learned coupling data over static buffer when sample_count >= 3", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1", "R2"],
      weather: "rain-light",
      weatherCoupling: [
        { route_id: "R1", condition: "rain-light", mean_extra_delay_sec: 200, sample_count: 5 },
        { route_id: "R2", condition: "rain-light", mean_extra_delay_sec: 100, sample_count: 3 },
        { route_id: "R3", condition: "rain-light", mean_extra_delay_sec: 999, sample_count: 10 },
      ],
    });
    // avg of R1,R2 (R3 not in routeIds) = 150
    expect(r.weatherSec).toBe(150);
  });

  it("ignores coupling rows with sample_count < 3", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1"],
      weather: "rain-light",
      weatherCoupling: [
        { route_id: "R1", condition: "rain-light", mean_extra_delay_sec: 200, sample_count: 2 },
      ],
    });
    expect(r.weatherSec).toBe(120); // falls back to static
  });

  it("clamps negative coupling averages to 0", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1"],
      weather: "rain-light",
      weatherCoupling: [
        { route_id: "R1", condition: "rain-light", mean_extra_delay_sec: -50, sample_count: 5 },
      ],
    });
    expect(r.weatherSec).toBe(0);
  });

  it("adds traffic component when a route is meaningfully late", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1"],
      weather: "clear",
      delays: [{ route_id: "R1", mean_delay_sec: 200, sample_count: 5 }],
    });
    expect(r.trafficSec).toBe(200);
    expect(r.extraSec).toBe(200);
    expect(r.reasonShort).toBe("traffic · +3 min");
  });

  it("ignores delay samples below 90s threshold", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1"],
      weather: "clear",
      delays: [{ route_id: "R1", mean_delay_sec: 89, sample_count: 5 }],
    });
    expect(r.trafficSec).toBe(0);
  });

  it("ignores delay samples with sample_count < 3", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1"],
      weather: "clear",
      delays: [{ route_id: "R1", mean_delay_sec: 500, sample_count: 2 }],
    });
    expect(r.trafficSec).toBe(0);
  });

  it("caps traffic component at 8 minutes", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1"],
      weather: "clear",
      delays: [{ route_id: "R1", mean_delay_sec: 1000, sample_count: 5 }],
    });
    expect(r.trafficSec).toBe(480);
  });

  it("picks the worst delay across multiple relevant routes", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1", "R2"],
      weather: "clear",
      delays: [
        { route_id: "R1", mean_delay_sec: 120, sample_count: 5 },
        { route_id: "R2", mean_delay_sec: 300, sample_count: 5 },
        { route_id: "R3", mean_delay_sec: 900, sample_count: 5 },
      ],
    });
    expect(r.trafficSec).toBe(300);
  });

  it("combines weather + traffic and caps total at MAX_EXTRA_SEC (20 min)", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1"],
      weather: "snow",
      delays: [{ route_id: "R1", mean_delay_sec: 1000, sample_count: 5 }],
    });
    // weatherSec=420 + trafficSec=480 = 900, under 1200 cap
    expect(r.extraSec).toBe(900);
    expect(r.reasonShort).toBe("snow · +7 min / traffic · +8 min");
  });

  it("caps combined extraSec at 20 minutes", () => {
    const r = computeLeaveAdjustment({
      routeIds: ["R1", "R2"],
      weather: "snow",
      weatherCoupling: [
        { route_id: "R1", condition: "snow", mean_extra_delay_sec: 1000, sample_count: 5 },
      ],
      delays: [{ route_id: "R1", mean_delay_sec: 1000, sample_count: 5 }],
    });
    expect(r.extraSec).toBe(20 * 60);
  });

  it("handles empty routeIds gracefully with delays present", () => {
    const r = computeLeaveAdjustment({
      routeIds: [],
      weather: "clear",
      delays: [{ route_id: "R1", mean_delay_sec: 500, sample_count: 5 }],
    });
    expect(r.trafficSec).toBe(0);
  });
});

describe("fetchCurrentWeather", () => {
  it("returns classified weather on success", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: { weather_code: 61 } }),
    });
    const r = await fetchCurrentWeather(35.17, 33.36, fakeFetch as unknown as typeof fetch);
    expect(r).toBe("rain-light");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("returns unknown when response not ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const r = await fetchCurrentWeather(0, 0, fakeFetch as unknown as typeof fetch);
    expect(r).toBe("unknown");
  });

  it("returns unknown when fetch throws", async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error("network down"));
    const r = await fetchCurrentWeather(0, 0, fakeFetch as unknown as typeof fetch);
    expect(r).toBe("unknown");
  });

  it("returns unknown when json is missing weather_code", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const r = await fetchCurrentWeather(0, 0, fakeFetch as unknown as typeof fetch);
    expect(r).toBe("unknown");
  });
});
