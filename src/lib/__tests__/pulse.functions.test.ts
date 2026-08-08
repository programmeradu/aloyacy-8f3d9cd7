import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: {
  freshness: TableResult;
  rpc: TableResult;
  rtSnapshots: TableResult | ((calls: unknown[]) => TableResult);
} = {
  freshness: { data: null, error: null },
  rpc: { data: [], error: null },
  rtSnapshots: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    delay_stats: () => state.freshness,
    "rpc:pulse_route_stats": () => state.rpc,
    rt_snapshots: (calls) =>
      typeof state.rtSnapshots === "function"
        ? (state.rtSnapshots as (c: unknown[]) => TableResult)(calls)
        : state.rtSnapshots,
  });
  return { supabaseAdmin: client };
});

const fetchRealtimeMock = vi.fn();
vi.mock("@/lib/gtfs-rt.server", () => ({
  fetchRealtime: () => fetchRealtimeMock(),
}));

const { getPulse, getLivePulse, getPulseHourStrip } = await import("../pulse.functions");

const KNOWN_ROUTE_A = "40000011";
const KNOWN_ROUTE_B = "40010011";

describe("getPulse", () => {
  beforeEach(() => {
    state.freshness = { data: null, error: null };
    state.rpc = { data: [], error: null };
    fetchRealtimeMock.mockReset();
    fetchRealtimeMock.mockResolvedValue({ arrivals: [], fetchedAt: 111 });
  });

  it("falls back to realtime when there is no fresh delay_stats row", async () => {
    fetchRealtimeMock.mockResolvedValue({
      arrivals: [
        { routeId: KNOWN_ROUTE_A, delaySec: 200 },
        { routeId: KNOWN_ROUTE_A, delaySec: 220 },
        { routeId: "unknown-route", delaySec: 50 },
      ],
      fetchedAt: 555,
    });
    const out = await callServerFn(getPulse, undefined);
    expect(out.generatedAt).toBe(555);
    expect(out.excludedUnknown).toBe(1);
    expect(out.routesTracked).toBe(1);
    expect(out.hottest[0]?.routeId).toBe(KNOWN_ROUTE_A);
  });

  it("returns an all-empty pulse when realtime has no arrivals either", async () => {
    fetchRealtimeMock.mockResolvedValue({ arrivals: [], fetchedAt: 999 });
    const out = await callServerFn(getPulse, undefined);
    expect(out.totalSamples).toBe(0);
    expect(out.hottest).toEqual([]);
    expect(out.coldest).toEqual([]);
    expect(out.steadiest).toEqual([]);
  });

  it("swallows realtime fetch failure and returns an empty pulse", async () => {
    fetchRealtimeMock.mockRejectedValue(new Error("network down"));
    const out = await callServerFn(getPulse, undefined);
    expect(out.totalSamples).toBe(0);
    expect(out.routesTracked).toBe(0);
  });

  it("falls back to realtime when rpc errors", async () => {
    state.freshness = { data: { updated_at: new Date().toISOString() }, error: null };
    state.rpc = { data: null, error: { message: "rpc broke" } };
    fetchRealtimeMock.mockResolvedValue({ arrivals: [], fetchedAt: 42 });
    const out = await callServerFn(getPulse, undefined);
    expect(out.totalSamples).toBe(0);
  });

  it("falls back to realtime when rpc returns no rows", async () => {
    state.freshness = { data: { updated_at: new Date().toISOString() }, error: null };
    state.rpc = { data: [], error: null };
    fetchRealtimeMock.mockResolvedValue({ arrivals: [], fetchedAt: 7 });
    const out = await callServerFn(getPulse, undefined);
    expect(out.totalSamples).toBe(0);
  });

  it("builds a pulse snapshot from RPC aggregates, ranking hottest/coldest/steadiest", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-05-01T12:00:00Z"));
    state.freshness = { data: { updated_at: new Date().toISOString() }, error: null };
    state.rpc = {
      data: [
        { route_id: KNOWN_ROUTE_A, sum_delay_weighted: 100 * 10, sample_count: 10 }, // mean 100, hot
        { route_id: KNOWN_ROUTE_B, sum_delay_weighted: -50 * 8, sample_count: 8 }, // mean -50, cold
        { route_id: "not-in-timetable", sum_delay_weighted: 500, sample_count: 5 },
      ],
      error: null,
    };
    const out = await callServerFn(getPulse, undefined);
    expect(out.excludedUnknown).toBe(1);
    expect(out.routesTracked).toBe(2);
    expect(out.hottest[0]?.routeId).toBe(KNOWN_ROUTE_A);
    expect(out.coldest[0]?.routeId).toBe(KNOWN_ROUTE_B);
    expect(out.totalSamples).toBe(18);
    vi.useRealTimers();
  });
});

describe("getLivePulse", () => {
  beforeEach(() => {
    state.rtSnapshots = { data: [], error: null };
  });

  it("returns an empty live pulse when there are no recent snapshots", async () => {
    const out = await callServerFn(getLivePulse, undefined);
    expect(out.observations).toBe(0);
    expect(out.onTimePct).toBe(0);
    expect(out.medianDelaySec).toBe(0);
  });

  it("breaks the paging loop on error and still returns a result", async () => {
    state.rtSnapshots = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getLivePulse, undefined);
    expect(out.observations).toBe(0);
  });

  it("dedups by trip/stop, computes on-time/early/late buckets and median", async () => {
    const now = new Date().toISOString();
    state.rtSnapshots = {
      data: [
        { trip_id: "t1", stop_id: "s1", delay_sec: 500, captured_at: now }, // late
        { trip_id: "t1", stop_id: "s1", delay_sec: 10, captured_at: now }, // duplicate key, ignored (first wins)
        { trip_id: "t2", stop_id: "s2", delay_sec: -200, captured_at: now }, // early
        { trip_id: "t3", stop_id: "s3", delay_sec: 0, captured_at: now }, // on time
      ],
      error: null,
    };
    const out = await callServerFn(getLivePulse, undefined);
    expect(out.observations).toBe(3);
    expect(out.latePct).toBe(33);
    expect(out.earlyPct).toBe(33);
    expect(out.onTimePct).toBe(33);
  });
});

describe("getPulseHourStrip", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.CUSTOM_SUPABASE_URL;
  const originalKey = process.env.CUSTOM_SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.CUSTOM_SUPABASE_URL = "https://example.supabase.co";
    process.env.CUSTOM_SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.CUSTOM_SUPABASE_URL = originalUrl;
    process.env.CUSTOM_SUPABASE_SERVICE_ROLE_KEY = originalKey;
    vi.useRealTimers();
  });

  it("builds 24 buckets from a successful RPC response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T10:00:00Z")); // summer -> EEST +3
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ hour_of_day: 5, sample_count: 4, mean_delay_sec: 20 }],
    }) as unknown as typeof fetch;

    const out = await callServerFn(getPulseHourStrip, undefined);
    expect(out.buckets).toHaveLength(24);
    const bucket5 = out.buckets.find((b) => b.hour === 5);
    expect(bucket5?.sampleCount).toBe(4);
    expect(bucket5?.meanDelaySec).toBe(20);
    expect(out.nowHour).toBe(13);
  });

  it("returns zeroed buckets when the RPC responds with an error status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    }) as unknown as typeof fetch;

    const out = await callServerFn(getPulseHourStrip, undefined);
    expect(out.buckets.every((b) => b.sampleCount === 0)).toBe(true);
  });

  it("returns zeroed buckets when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const out = await callServerFn(getPulseHourStrip, undefined);
    expect(out.buckets.every((b) => b.sampleCount === 0)).toBe(true);
  });
});
