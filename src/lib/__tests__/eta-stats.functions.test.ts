import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { segmentSpeeds: TableResult; dwellObservations: TableResult } = {
  segmentSpeeds: { data: [], error: null },
  dwellObservations: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client", () => {
  const { client } = makeSupabaseMock({
    segment_speeds: () => state.segmentSpeeds,
    dwell_observations: () => state.dwellObservations,
  });
  return { supabase: client };
});

const { getEtaStatsForRoutes } = await import("../eta-stats.functions");

beforeEach(() => {
  state.segmentSpeeds = { data: [], error: null };
  state.dwellObservations = { data: [], error: null };
});

describe("getEtaStatsForRoutes", () => {
  it("returns empty maps when there is no data", async () => {
    const out = await callServerFn(getEtaStatsForRoutes, { routeIds: ["r1"] });
    expect(out.segments).toEqual({});
    expect(out.dwells).toEqual({});
  });

  it("keys segment and dwell stats by route/stop composite keys", async () => {
    state.segmentSpeeds = {
      data: [{ route_id: "r1", from_stop_id: "sA", to_stop_id: "sB", mean_mps: 8.5, sample_count: 12 }],
      error: null,
    };
    state.dwellObservations = {
      data: [{ route_id: "r1", stop_id: "sA", mean_dwell_sec: 25, sample_count: 6 }],
      error: null,
    };
    const out = await callServerFn(getEtaStatsForRoutes, { routeIds: ["r1"] });
    expect(out.segments["r1|sA|sB"]).toEqual({ meanMps: 8.5, sampleCount: 12 });
    expect(out.dwells["r1|sA"]).toEqual({ meanDwellSec: 25, sampleCount: 6 });
  });

  it("defaults missing numeric fields to zero", async () => {
    state.segmentSpeeds = {
      data: [{ route_id: "r1", from_stop_id: "sA", to_stop_id: "sB", mean_mps: null, sample_count: null }],
      error: null,
    };
    const out = await callServerFn(getEtaStatsForRoutes, { routeIds: ["r1"] });
    expect(out.segments["r1|sA|sB"]).toEqual({ meanMps: 0, sampleCount: 0 });
  });

  it("rejects an empty routeIds list", async () => {
    await expect(callServerFn(getEtaStatsForRoutes, { routeIds: [] })).rejects.toThrow();
  });
});
