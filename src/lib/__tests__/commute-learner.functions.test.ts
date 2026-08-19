import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { patterns: TableResult; updated: unknown[]; inserted: unknown[] } = {
  patterns: { data: null, error: null },
  updated: [],
  inserted: [],
};

vi.mock("@/integrations/supabase/auth-middleware", async () => {
  const { createMiddleware } = await import("@tanstack/react-start");
  return {
    requireSupabaseAuth: createMiddleware({ type: "function" }).server(async ({ next }) => {
      const { client } = makeSupabaseMock({
        commute_patterns: (calls) => {
          const last = calls[calls.length - 1];
          if (last?.method === "update") state.updated.push(last.args);
          if (last?.method === "insert") state.inserted.push(last.args);
          return state.patterns;
        },
      });
      return next({ context: { supabase: client, userId: "user-1" } });
    }),
  };
});

const { recordCommutePattern, getTopCommuteSuggestion } = await import(
  "../commute-learner.functions"
);

beforeEach(() => {
  state.patterns = { data: null, error: null };
  state.updated = [];
  state.inserted = [];
});

const trip = {
  fromLat: 35.17,
  fromLng: 33.36,
  toLat: 35.18,
  toLng: 33.37,
  startedAtUnix: Math.floor(new Date("2024-05-01T08:15:00Z").getTime() / 1000),
};

describe("recordCommutePattern", () => {
  it("inserts a new pattern when none exists yet", async () => {
    state.patterns = { data: null, error: null };
    const out = await callServerFn(recordCommutePattern, trip);
    expect(out.ok).toBe(true);
    expect(state.inserted).toHaveLength(1);
    expect(state.updated).toHaveLength(0);
  });

  it("increments the existing pattern's count and dow_mask", async () => {
    state.patterns = { data: { id: "p1", count: 3, dow_mask: 0b0001 }, error: null };
    const out = await callServerFn(recordCommutePattern, trip);
    expect(out.ok).toBe(true);
    expect(state.updated).toHaveLength(1);
    const [updatePayload] = state.updated[0] as [Record<string, unknown>];
    expect(updatePayload.count).toBe(4);
  });
});

describe("getTopCommuteSuggestion", () => {
  it("returns null when there are no saved patterns", async () => {
    state.patterns = { data: [], error: null };
    const out = await callServerFn(getTopCommuteSuggestion, undefined);
    expect(out.suggestion).toBeNull();
  });

  it("suggests the highest scoring nearby pattern", async () => {
    const now = new Date();
    const bucketNow = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
    const dowBit = 1 << now.getDay();
    state.patterns = {
      data: [
        {
          from_label: "Home",
          to_label: "Work",
          from_lat: 35.17,
          from_lng: 33.36,
          to_lat: 35.18,
          to_lng: 33.37,
          time_bucket: bucketNow,
          dow_mask: dowBit,
          count: 10,
        },
        {
          from_label: "Home",
          to_label: "Gym",
          from_lat: 35.17,
          from_lng: 33.36,
          to_lat: 35.2,
          to_lng: 33.4,
          time_bucket: (bucketNow + 24) % 48,
          dow_mask: 0,
          count: 3,
        },
      ],
      error: null,
    };
    const out = await callServerFn(getTopCommuteSuggestion, undefined);
    expect(out.suggestion?.toLabel).toBe("Work");
    expect(out.suggestion?.count).toBe(10);
  });

  it("returns null when the best match scores too low or is too far off in time", async () => {
    const now = new Date();
    const bucketNow = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
    state.patterns = {
      data: [
        {
          from_label: "Home",
          to_label: "Rare",
          from_lat: 35.17,
          from_lng: 33.36,
          to_lat: 35.2,
          to_lng: 33.4,
          time_bucket: (bucketNow + 24) % 48, // ~12h away
          dow_mask: 0,
          count: 2,
        },
      ],
      error: null,
    };
    const out = await callServerFn(getTopCommuteSuggestion, undefined);
    expect(out.suggestion).toBeNull();
  });
});
