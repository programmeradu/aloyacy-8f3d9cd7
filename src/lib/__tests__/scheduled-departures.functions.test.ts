import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: {
  claims: { sub: string } | null;
  scheduled_departures: TableResult;
} = {
  claims: { sub: "user-1" },
  scheduled_departures: { data: null, error: null },
};

// Session verification and the user-scoped D1 client stand in for the old
// Supabase getClaims + RLS client.
vi.mock("@/lib/auth/session.server", () => ({
  claimsFromRequest: vi.fn(async () => state.claims),
}));
vi.mock("@/lib/db", () => ({
  createUserScopedClient: vi.fn(() => ({
    from: makeSupabaseMock({ scheduled_departures: () => state.scheduled_departures }).client.from,
  })),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(
    () => new Request("http://localhost/x", { headers: { authorization: "Bearer good-token" } }),
  ),
}));

const originalEnv = { ...process.env };

const { scheduleDeparture, listScheduledDepartures, cancelScheduledDeparture } =
  await import("../scheduled-departures.functions");

const VALID_PLAN = {
  fromLabel: "Home",
  toLabel: "Work",
  fromLat: 35.17,
  fromLng: 33.36,
  toLat: 35.18,
  toLng: 33.37,
  legs: [{ kind: "bus", routeId: "40000011" }],
  leaveByUnix: 1_700_000_000,
};

describe("scheduled-departures.functions", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CUSTOM_SUPABASE_URL = "https://example.supabase.co";
    process.env.CUSTOM_SUPABASE_ANON_KEY = "anon-key";
    state.claims = { sub: "user-1" };
    state.scheduled_departures = { data: null, error: null };
  });

  describe("scheduleDeparture", () => {
    it("rejects invalid input", async () => {
      await expect(
        callServerFn(scheduleDeparture, {
          arriveByUnix: 1,
          remindAtUnix: 1,
          plan: { ...VALID_PLAN, legs: [] },
        }),
      ).rejects.toThrow();
    });

    it("throws when unauthenticated", async () => {
      state.claims = null;
      await expect(
        callServerFn(scheduleDeparture, {
          arriveByUnix: 1_700_001_000,
          remindAtUnix: 1_700_000_500,
          plan: VALID_PLAN,
        }),
      ).rejects.toThrow(/Unauthorized/);
    });

    it("inserts a scheduled departure and returns its id", async () => {
      state.scheduled_departures = { data: { id: "dep-1" }, error: null };
      const out = await callServerFn(scheduleDeparture, {
        arriveByUnix: 1_700_001_000,
        remindAtUnix: 1_700_000_500,
        plan: VALID_PLAN,
      });
      expect(out).toEqual({ ok: true, id: "dep-1" });
    });

    it("throws when the insert fails", async () => {
      state.scheduled_departures = { data: null, error: { message: "insert failed" } };
      await expect(
        callServerFn(scheduleDeparture, {
          arriveByUnix: 1_700_001_000,
          remindAtUnix: 1_700_000_500,
          plan: VALID_PLAN,
        }),
      ).rejects.toThrow("insert failed");
    });
  });

  describe("listScheduledDepartures", () => {
    it("returns the rows from the query", async () => {
      state.scheduled_departures = {
        data: [{ id: "dep-1", arrive_by_unix: 1_700_001_000 }],
        error: null,
      };
      const out = await callServerFn(listScheduledDepartures, undefined);
      expect(out).toHaveLength(1);
    });

    it("returns an empty array when data is null", async () => {
      state.scheduled_departures = { data: null, error: null };
      const out = await callServerFn(listScheduledDepartures, undefined);
      expect(out).toEqual([]);
    });

    it("throws on query error", async () => {
      state.scheduled_departures = { data: null, error: { message: "query broke" } };
      await expect(callServerFn(listScheduledDepartures, undefined)).rejects.toThrow("query broke");
    });
  });

  describe("cancelScheduledDeparture", () => {
    it("rejects an invalid id", async () => {
      await expect(callServerFn(cancelScheduledDeparture, { id: "not-a-uuid" })).rejects.toThrow();
    });

    it("cancels a scheduled departure", async () => {
      state.scheduled_departures = { data: null, error: null };
      const out = await callServerFn(cancelScheduledDeparture, {
        id: "11111111-1111-4111-8111-111111111111",
      });
      expect(out).toEqual({ ok: true });
    });

    it("throws when the update fails", async () => {
      state.scheduled_departures = { data: null, error: { message: "update failed" } };
      await expect(
        callServerFn(cancelScheduledDeparture, {
          id: "11111111-1111-4111-8111-111111111111",
        }),
      ).rejects.toThrow("update failed");
    });
  });
});
