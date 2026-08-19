import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { delayStats: TableResult } = {
  delayStats: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    delay_stats: () => state.delayStats,
  });
  return { supabaseAdmin: client };
});

const { getRouteReliability, getStopReliability, aggregateStopReliability } = await import(
  "../reliability.functions"
);

beforeEach(() => {
  state.delayStats = { data: [], error: null };
});

describe("getRouteReliability", () => {
  it("rejects empty routeIds", async () => {
    await expect(callServerFn(getRouteReliability, { routeIds: [] })).rejects.toThrow();
  });

  it("returns unknown tier for routes with no rows on error", async () => {
    state.delayStats = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getRouteReliability, { routeIds: ["r1"] });
    expect(out).toEqual([
      { routeId: "r1", onTimePct: 0, meanDelaySec: 0, sampleCount: 0, tier: "unknown" },
    ]);
  });

  it("returns unknown for a route absent from the rows", async () => {
    state.delayStats = { data: [], error: null };
    const out = await callServerFn(getRouteReliability, { routeIds: ["r1"] });
    expect(out[0]?.tier).toBe("unknown");
  });

  it("ignores buckets with sample_count below 3", async () => {
    state.delayStats = {
      data: [{ route_id: "r1", mean_delay_sec: 0, stddev_delay_sec: 10, sample_count: 2 }],
      error: null,
    };
    const out = await callServerFn(getRouteReliability, { routeIds: ["r1"] });
    expect(out[0]?.tier).toBe("unknown");
    expect(out[0]?.sampleCount).toBe(0);
  });

  it("rates high reliability for tight, on-time buckets with enough samples", async () => {
    state.delayStats = {
      data: [{ route_id: "r1", mean_delay_sec: 0, stddev_delay_sec: 10, sample_count: 50 }],
      error: null,
    };
    const out = await callServerFn(getRouteReliability, { routeIds: ["r1"] });
    expect(out[0]?.tier).toBe("high");
    expect(out[0]?.onTimePct).toBeGreaterThanOrEqual(80);
    expect(out[0]?.sampleCount).toBe(50);
  });

  it("rates low reliability for consistently late buckets", async () => {
    state.delayStats = {
      data: [{ route_id: "r1", mean_delay_sec: 900, stddev_delay_sec: 60, sample_count: 40 }],
      error: null,
    };
    const out = await callServerFn(getRouteReliability, { routeIds: ["r1"] });
    expect(out[0]?.tier).toBe("low");
    expect(out[0]?.meanDelaySec).toBe(900);
  });

  it("weights aggregation across multiple buckets for the same route", async () => {
    state.delayStats = {
      data: [
        { route_id: "r1", mean_delay_sec: 0, stddev_delay_sec: 10, sample_count: 40 },
        { route_id: "r1", mean_delay_sec: 900, stddev_delay_sec: 60, sample_count: 40 },
      ],
      error: null,
    };
    const out = await callServerFn(getRouteReliability, { routeIds: ["r1"] });
    expect(out[0]?.sampleCount).toBe(80);
    expect(out[0]?.meanDelaySec).toBe(450);
  });

  it("handles multiple requested routeIds independently", async () => {
    state.delayStats = {
      data: [{ route_id: "r1", mean_delay_sec: 0, stddev_delay_sec: 10, sample_count: 50 }],
      error: null,
    };
    const out = await callServerFn(getRouteReliability, { routeIds: ["r1", "r2"] });
    expect(out.find((r) => r.routeId === "r1")?.tier).toBe("high");
    expect(out.find((r) => r.routeId === "r2")?.tier).toBe("unknown");
  });
});

describe("getStopReliability", () => {
  it("rejects an empty stopId", async () => {
    await expect(
      callServerFn(getStopReliability, { stopId: "", routeIds: ["r1"] }),
    ).rejects.toThrow();
  });

  it("returns unknown rows for all routeIds on error", async () => {
    state.delayStats = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getStopReliability, { stopId: "s1", routeIds: ["r1"] });
    expect(out).toEqual([
      { routeId: "r1", stopId: "s1", onTimePct: 0, meanDelaySec: 0, sampleCount: 0, tier: "unknown" },
    ]);
  });

  it("computes a rated tier scoped to the stop", async () => {
    state.delayStats = {
      data: [{ route_id: "r1", mean_delay_sec: 30, stddev_delay_sec: 20, sample_count: 35 }],
      error: null,
    };
    const out = await callServerFn(getStopReliability, { stopId: "s1", routeIds: ["r1"] });
    expect(out[0]?.stopId).toBe("s1");
    expect(out[0]?.sampleCount).toBe(35);
    expect(out[0]?.tier).not.toBe("unknown");
  });

  it("returns unknown for a route with no matching rows at this stop", async () => {
    state.delayStats = { data: [], error: null };
    const out = await callServerFn(getStopReliability, { stopId: "s1", routeIds: ["r1"] });
    expect(out[0]).toEqual({
      routeId: "r1",
      stopId: "s1",
      onTimePct: 0,
      meanDelaySec: 0,
      sampleCount: 0,
      tier: "unknown",
    });
  });
});

describe("aggregateStopReliability", () => {
  it("returns unknown with empty routeIds when no row is rated", () => {
    const out = aggregateStopReliability([
      { routeId: "r1", stopId: "s1", onTimePct: 0, meanDelaySec: 0, sampleCount: 0, tier: "unknown" },
    ]);
    expect(out.tier).toBe("unknown");
    expect(out.stopId).toBe("s1");
    expect(out.routeIds).toEqual(["r1"]);
  });

  it("weights routes by sampleCount when combining", () => {
    const out = aggregateStopReliability([
      { routeId: "r1", stopId: "s1", onTimePct: 90, meanDelaySec: 10, sampleCount: 90, tier: "high" },
      { routeId: "r2", stopId: "s1", onTimePct: 50, meanDelaySec: 500, sampleCount: 10, tier: "low" },
    ]);
    expect(out.sampleCount).toBe(100);
    expect(out.routeIds).toEqual(["r1", "r2"]);
    // Weighted average should be much closer to r1's 90% than a naive 70% mean.
    expect(out.onTimePct).toBeGreaterThan(80);
    expect(out.tier).toBe("high");
  });

  it("falls back to empty stopId when no rows are provided at all", () => {
    const out = aggregateStopReliability([]);
    expect(out.stopId).toBe("");
    expect(out.tier).toBe("unknown");
  });
});
