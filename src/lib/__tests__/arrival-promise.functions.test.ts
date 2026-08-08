import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: {
  claims: { sub: string } | null;
  arrival_promises: TableResult;
  plan: {
    ladder: unknown[];
    best: { itineraryId: string; leaveByUnix: number } | null;
    itinerary: { id: string; legs: unknown[] } | null;
    leaveByUnix: number | null;
    bufferSec: number;
    reasonShort: string | null;
    unmakeable: boolean;
    earliestArrivalUnix: number | null;
  };
} = {
  claims: { sub: "user-1" },
  arrival_promises: { data: null, error: null },
  plan: {
    ladder: [],
    best: { itineraryId: "it-1", leaveByUnix: 1_700_000_000 },
    itinerary: { id: "it-1", legs: [] },
    leaveByUnix: 1_700_000_000,
    bufferSec: 60,
    reasonShort: null,
    unmakeable: false,
    earliestArrivalUnix: 1_700_003_600,
  },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getClaims: vi.fn(async () =>
        state.claims ? { data: { claims: state.claims }, error: null } : { data: null, error: { message: "bad token" } },
      ),
    },
    from: makeSupabaseMock({ arrival_promises: () => state.arrival_promises }).client.from,
  })),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => new Request("http://localhost/x", { headers: { authorization: "Bearer good-token" } })),
}));

vi.mock("@/lib/arrival-promise.server", () => ({
  computePromisePlan: vi.fn(async () => state.plan),
  planSnapshot: vi.fn((it: unknown) => (it ? { itineraryId: (it as { id: string }).id } : {})),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: makeSupabaseMock({ push_subscriptions: { data: null, error: null } }).client,
}));

const {
  createArrivalPromise,
  listArrivalPromises,
  cancelArrivalPromise,
  refreshArrivalPromise,
} = await import("../arrival-promise.functions");

const ORIGIN = { lat: 35.17, lng: 33.36, label: "Home" };
const DEST = { lat: 34.917, lng: 33.64, label: "Beach" };

function futureUnix(sec: number) {
  return Math.floor(Date.now() / 1000) + sec;
}

describe("arrival-promise server functions (auth)", () => {
  beforeEach(() => {
    state.claims = { sub: "user-1" };
    state.arrival_promises = { data: null, error: null };
  });

  it("rejects when no bearer token is present", async () => {
    state.claims = null;
    await expect(
      callServerFn(createArrivalPromise, {
        targetArrivalUnix: futureUnix(3600),
        margin: "normal",
        origin: ORIGIN,
        destination: DEST,
      }),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("rejects an arrival time less than 5 minutes away", async () => {
    await expect(
      callServerFn(createArrivalPromise, {
        targetArrivalUnix: futureUnix(60),
        margin: "normal",
        origin: ORIGIN,
        destination: DEST,
      }),
    ).rejects.toThrow(/at least 5 minutes/);
  });

  it("rejects an arrival time beyond the max horizon", async () => {
    await expect(
      callServerFn(createArrivalPromise, {
        targetArrivalUnix: futureUnix(9 * 24 * 3600),
        margin: "normal",
        origin: ORIGIN,
        destination: DEST,
      }),
    ).rejects.toThrow(/up to a week/);
  });

  it("creates a promise and returns the inserted row", async () => {
    state.arrival_promises = {
      data: [{ id: "p1", status: "watching" }],
      error: null,
    };
    const out = await callServerFn(createArrivalPromise, {
      targetArrivalUnix: futureUnix(3600),
      margin: "normal",
      origin: ORIGIN,
      destination: DEST,
    });
    expect((out as { id: string }).id).toBe("p1");
  });

  it("marks the promise missed when the plan is unmakeable", async () => {
    state.plan = { ...state.plan, unmakeable: true, itinerary: null, best: null, leaveByUnix: null };
    state.arrival_promises = { data: [{ id: "p2", status: "missed" }], error: null };
    const out = await callServerFn(createArrivalPromise, {
      targetArrivalUnix: futureUnix(3600),
      margin: "normal",
      origin: ORIGIN,
      destination: DEST,
    });
    expect((out as { status: string }).status).toBe("missed");
  });

  it("surfaces an insert error", async () => {
    state.arrival_promises = { data: null, error: { message: "insert failed" } };
    await expect(
      callServerFn(createArrivalPromise, {
        targetArrivalUnix: futureUnix(3600),
        margin: "normal",
        origin: ORIGIN,
        destination: DEST,
      }),
    ).rejects.toThrow(/insert failed/);
  });

  it("lists active promises", async () => {
    state.arrival_promises = { data: [{ id: "p1" }, { id: "p2" }], error: null };
    const out = await callServerFn(listArrivalPromises, undefined as never);
    expect(out).toHaveLength(2);
  });

  it("propagates a list query error", async () => {
    state.arrival_promises = { data: null, error: { message: "list failed" } };
    await expect(callServerFn(listArrivalPromises, undefined as never)).rejects.toThrow(/list failed/);
  });

  it("rejects a malformed id when cancelling", async () => {
    await expect(callServerFn(cancelArrivalPromise, { id: "not-a-uuid" })).rejects.toThrow();
  });

  it("cancels a promise by id", async () => {
    state.arrival_promises = { data: null, error: null };
    const out = await callServerFn(cancelArrivalPromise, {
      id: "11111111-1111-1111-1111-111111111111",
    });
    expect(out).toEqual({ ok: true });
  });

  it("refreshes a promise, recomputing the plan", async () => {
    state.arrival_promises = {
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          target_arrival_unix: futureUnix(3600),
          margin_pref: "normal",
          origin_lat: ORIGIN.lat,
          origin_lng: ORIGIN.lng,
          origin_label: ORIGIN.label,
          destination_lat: DEST.lat,
          destination_lng: DEST.lng,
          destination_label: DEST.label,
          leave_by_unix: futureUnix(3000),
          status: "missed",
        },
      ],
      error: null,
    };
    const out = await callServerFn(refreshArrivalPromise, {
      id: "11111111-1111-1111-1111-111111111111",
    });
    expect((out as { id: string }).id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("throws when the promise to refresh is not found", async () => {
    state.arrival_promises = { data: null, error: { message: "not found" } };
    await expect(
      callServerFn(refreshArrivalPromise, { id: "11111111-1111-1111-1111-111111111111" }),
    ).rejects.toThrow(/not found/);
  });
});
