import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: {
  verified: boolean;
  ensure: { ok: true; token: string } | { ok: false; error: string };
  history: TableResult;
  update: TableResult;
  insert: TableResult;
  user: { id: string } | null;
} = {
  verified: true,
  ensure: { ok: true, token: "new-token" },
  history: { data: [], error: null },
  update: { data: null, error: null },
  insert: { data: null, error: null },
  user: null,
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    trip_history: (calls) => {
      const last = calls[calls.length - 1];
      if (last?.method === "update") return state.update;
      if (last?.method === "insert") return state.insert;
      return state.history;
    },
  });
  (client as unknown as { auth: unknown }).auth = {
    getUser: vi.fn(async () =>
      state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: null },
    ),
  };
  return { supabaseAdmin: client };
});

vi.mock("../device-auth.server", () => ({
  verifyDeviceToken: vi.fn(async () => state.verified),
  ensureDeviceToken: vi.fn(async () => state.ensure),
}));

const { claimDeviceToken, linkDeviceToUser, recordTripHistory, getTripSuggestions } = await import(
  "../suggestions.functions"
);

const DEVICE = { deviceId: "device-1234567890", deviceToken: "token-1234567890123456789" };
const POINT = { lat: 35.17, lng: 33.36, label: "Home" };

describe("claimDeviceToken", () => {
  beforeEach(() => {
    state.ensure = { ok: true, token: "new-token" };
  });

  it("returns a token on success", async () => {
    const out = await callServerFn(claimDeviceToken, { deviceId: DEVICE.deviceId });
    expect(out).toEqual({ ok: true, token: "new-token" });
  });

  it("returns an error when already claimed", async () => {
    state.ensure = { ok: false, error: "device already claimed" };
    const out = await callServerFn(claimDeviceToken, { deviceId: DEVICE.deviceId });
    expect(out.ok).toBe(false);
  });

  it("rejects a too-short deviceId", async () => {
    await expect(callServerFn(claimDeviceToken, { deviceId: "x" })).rejects.toThrow();
  });
});

describe("linkDeviceToUser", () => {
  beforeEach(() => {
    state.verified = true;
    state.user = null;
    state.update = { data: null, error: null };
  });

  it("rejects an invalid token", async () => {
    state.verified = false;
    const out = await callServerFn(linkDeviceToUser, DEVICE);
    expect(out).toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects when no accessToken resolves to a user", async () => {
    const out = await callServerFn(linkDeviceToUser, DEVICE);
    expect(out).toEqual({ ok: false, error: "no_user" });
  });

  it("links successfully when the access token resolves a user", async () => {
    state.user = { id: "user-1" };
    const out = await callServerFn(linkDeviceToUser, {
      ...DEVICE,
      accessToken: "a".repeat(24),
    });
    expect(out).toEqual({ ok: true });
  });
});

describe("recordTripHistory", () => {
  beforeEach(() => {
    state.verified = true;
    state.insert = { data: null, error: null };
  });

  it("rejects unauthorized callers", async () => {
    state.verified = false;
    const out = await callServerFn(recordTripHistory, { ...DEVICE, from: POINT, to: POINT });
    expect(out).toEqual({ ok: false, error: "unauthorized" });
  });

  it("records a trip successfully", async () => {
    const out = await callServerFn(recordTripHistory, { ...DEVICE, from: POINT, to: POINT });
    expect(out).toEqual({ ok: true });
  });

  it("surfaces an insert error", async () => {
    state.insert = { data: null, error: { message: "db down" } };
    const out = await callServerFn(recordTripHistory, { ...DEVICE, from: POINT, to: POINT });
    expect(out).toEqual({ ok: false, error: "db down" });
  });
});

describe("getTripSuggestions", () => {
  beforeEach(() => {
    state.verified = true;
    state.history = { data: [], error: null };
    state.user = null;
  });

  it("returns no suggestions for an unauthorized caller", async () => {
    state.verified = false;
    const out = await callServerFn(getTripSuggestions, DEVICE);
    expect(out.suggestions).toEqual([]);
  });

  it("returns no suggestions when there is no history", async () => {
    const out = await callServerFn(getTripSuggestions, DEVICE);
    expect(out.suggestions).toEqual([]);
  });

  it("returns no suggestions on a query error", async () => {
    state.history = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getTripSuggestions, DEVICE);
    expect(out.suggestions).toEqual([]);
  });

  it("groups by destination and ranks by score, current-hour bonus included", async () => {
    const now = new Date();
    const rows = [
      {
        from_lat: 35.0,
        from_lng: 33.0,
        from_label: "Home",
        to_lat: 34.917,
        to_lng: 33.64,
        to_label: "Beach",
        recorded_at: now.toISOString(),
        dow: now.getUTCDay(),
        hour: now.getUTCHours(),
      },
      {
        from_lat: 35.0,
        from_lng: 33.0,
        from_label: "Home",
        to_lat: 34.917,
        to_lng: 33.64,
        to_label: "Beach",
        recorded_at: now.toISOString(),
        dow: now.getUTCDay(),
        hour: now.getUTCHours(),
      },
      {
        from_lat: 35.0,
        from_lng: 33.0,
        from_label: "Home",
        to_lat: 35.131,
        to_lng: 33.301,
        to_label: "Mall",
        recorded_at: new Date(now.getTime() - 80 * 86_400_000).toISOString(),
        dow: (now.getUTCDay() + 3) % 7,
        hour: (now.getUTCHours() + 12) % 24,
      },
    ];
    state.history = { data: rows, error: null };
    const out = await callServerFn(getTripSuggestions, DEVICE);
    expect(out.suggestions[0]?.toLabel).toBe("Beach");
    expect(out.suggestions[0]?.blurb).toBe("Usually around now");
  });
});
