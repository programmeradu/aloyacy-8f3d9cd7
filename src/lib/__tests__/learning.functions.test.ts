import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { delayStats: TableResult; observedArrivals: TableResult } = {
  delayStats: { data: [], error: null },
  observedArrivals: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    delay_stats: () => state.delayStats,
    observed_arrivals: () => state.observedArrivals,
  });
  return { supabaseAdmin: client };
});

const { getLearnedStatsForStop, getLearnedStatsBulk, getAccuracySnapshot } =
  await import("../learning.functions");

beforeEach(() => {
  state.delayStats = { data: [], error: null };
  state.observedArrivals = { data: [], error: null };
});

describe("getLearnedStatsForStop", () => {
  it("returns rows on success", async () => {
    state.delayStats = { data: [{ route_id: "r1", mean_delay_sec: 30 }], error: null };
    const out = await callServerFn(getLearnedStatsForStop, { stopId: "s1" });
    expect(out.stats).toHaveLength(1);
  });

  it("returns an empty array on error", async () => {
    state.delayStats = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getLearnedStatsForStop, { stopId: "s1" });
    expect(out.stats).toEqual([]);
  });

  it("rejects an empty stopId", async () => {
    await expect(callServerFn(getLearnedStatsForStop, { stopId: "" })).rejects.toThrow();
  });
});

describe("getLearnedStatsBulk", () => {
  it("returns rows on success", async () => {
    state.delayStats = { data: [{ route_id: "r1", stop_id: "s1" }], error: null };
    const out = await callServerFn(getLearnedStatsBulk, { stopIds: ["s1", "s2"] });
    expect(out.stats).toHaveLength(1);
  });

  it("returns an empty array on error", async () => {
    state.delayStats = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getLearnedStatsBulk, { stopIds: ["s1"] });
    expect(out.stats).toEqual([]);
  });

  it("rejects an empty stopIds list", async () => {
    await expect(callServerFn(getLearnedStatsBulk, { stopIds: [] })).rejects.toThrow();
  });
});

describe("getAccuracySnapshot", () => {
  it("returns zeroed totals on a query error", async () => {
    state.observedArrivals = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getAccuracySnapshot, {});
    expect(out.totals).toEqual({ count: 0, meanSec: 0, p50Sec: 0, p90Sec: 0 });
    expect(out.recent).toEqual([]);
    expect(out.byRoute).toEqual([]);
  });

  it("rolls observed arrivals into per-route accuracy buckets and totals", async () => {
    state.observedArrivals = {
      data: [
        {
          route_id: "r1",
          stop_id: "s1",
          trip_id: "t1",
          last_delay_sec: 60,
          last_predicted_arrival: "2024-05-01T08:00:00Z",
          passed_at: "2024-05-01T08:01:00Z",
          last_seen_at: "2024-05-01T08:01:05Z",
        },
        {
          route_id: "r1",
          stop_id: "s2",
          trip_id: "t2",
          last_delay_sec: -30,
          last_predicted_arrival: "2024-05-01T08:10:00Z",
          passed_at: "2024-05-01T08:09:30Z",
          last_seen_at: "2024-05-01T08:09:35Z",
        },
        {
          route_id: "r2",
          stop_id: "s3",
          trip_id: "t3",
          last_delay_sec: 10,
          last_predicted_arrival: "2024-05-01T08:20:00Z",
          passed_at: "2024-05-01T08:20:10Z",
          last_seen_at: "2024-05-01T08:20:15Z",
        },
      ],
      error: null,
    };
    const out = await callServerFn(getAccuracySnapshot, { hours: 12, limit: 100 });
    expect(out.totals.count).toBe(3);
    expect(out.byRoute[0]?.routeId).toBe("r1");
    expect(out.byRoute[0]?.count).toBe(2);
    expect(out.recent).toHaveLength(3);
  });

  it("rejects out-of-range hours", async () => {
    await expect(callServerFn(getAccuracySnapshot, { hours: 0 })).rejects.toThrow();
  });
});
