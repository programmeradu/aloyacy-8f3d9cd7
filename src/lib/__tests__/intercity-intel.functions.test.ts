import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { delay_stats: TableResult } = {
  delay_stats: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    delay_stats: () => state.delay_stats,
  });
  return { supabaseAdmin: client };
});

const { getIntercityInsights } = await import("../intercity-intel.functions");

describe("getIntercityInsights", () => {
  beforeEach(() => {
    state.delay_stats = { data: [], error: null };
  });

  it("rejects invalid input", async () => {
    await expect(callServerFn(getIntercityInsights, { routeId: "" })).rejects.toThrow();
  });

  it("returns unknown tier when the query errors", async () => {
    state.delay_stats = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getIntercityInsights, { routeId: "IC1" });
    expect(out.tier).toBe("unknown");
    expect(out.sampleCount).toBe(0);
  });

  it("returns unknown tier when there are no rows", async () => {
    state.delay_stats = { data: [], error: null };
    const out = await callServerFn(getIntercityInsights, { routeId: "IC1" });
    expect(out.tier).toBe("unknown");
    expect(out.anomalies).toEqual([]);
  });

  it("computes learning tier, weekday/weekend split, best/worst window and anomalies", async () => {
    state.delay_stats = {
      data: [
        // weekday morning, very reliable
        { hour_of_day: 7, day_of_week: 1, mean_delay_sec: 0, sample_count: 10 },
        // Friday evening, badly late (anomaly candidate)
        { hour_of_day: 18, day_of_week: 5, mean_delay_sec: 400, sample_count: 10 },
        // Saturday, moderately late (weekend)
        { hour_of_day: 12, day_of_week: 6, mean_delay_sec: 150, sample_count: 10 },
        // bucket below MIN_BUCKET_SAMPLES, should be ignored
        { hour_of_day: 20, day_of_week: 0, mean_delay_sec: 900, sample_count: 2 },
      ],
      error: null,
    };
    const out = await callServerFn(getIntercityInsights, { routeId: "IC1" });
    expect(out.tier).toBe("learning"); // 30 samples < 60 threshold
    expect(out.sampleCount).toBe(30);
    expect(out.weekdayMeanDelaySec).not.toBeNull();
    expect(out.weekendMeanDelaySec).not.toBeNull();
    expect(out.bestWindow?.hourOfDay).toBe(7);
    expect(out.worstWindow?.hourOfDay).toBe(18);
    expect(out.anomalies.length).toBeGreaterThan(0);
    expect(out.anomalies[0]?.hourOfDay).toBe(18);
  });

  it("marks a route as rated once total samples clear the threshold", async () => {
    state.delay_stats = {
      data: [
        { hour_of_day: 7, day_of_week: 1, mean_delay_sec: 10, sample_count: 40 },
        { hour_of_day: 8, day_of_week: 2, mean_delay_sec: 20, sample_count: 30 },
      ],
      error: null,
    };
    const out = await callServerFn(getIntercityInsights, { routeId: "IC2" });
    expect(out.tier).toBe("rated");
    expect(out.sampleCount).toBe(70);
  });

  it("returns no worst window when every bucket is on-time or early", async () => {
    state.delay_stats = {
      data: [
        { hour_of_day: 7, day_of_week: 1, mean_delay_sec: -20, sample_count: 10 },
        { hour_of_day: 8, day_of_week: 2, mean_delay_sec: -10, sample_count: 10 },
      ],
      error: null,
    };
    const out = await callServerFn(getIntercityInsights, { routeId: "IC3" });
    expect(out.worstWindow).toBeNull();
    expect(out.anomalies).toEqual([]);
  });
});
