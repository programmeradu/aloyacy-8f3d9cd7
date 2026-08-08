import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { verified: boolean; result: TableResult } = {
  verified: true,
  result: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    trip_history: () => state.result,
  });
  return { supabaseAdmin: client };
});

vi.mock("../device-auth.server", () => ({
  verifyDeviceToken: vi.fn(async () => state.verified),
}));

const { getNlSuggestions } = await import("../nl-suggestions.functions");

const DEVICE = { deviceId: "device-1234567890", deviceToken: "token-1234567890123456789" };

describe("getNlSuggestions", () => {
  beforeEach(() => {
    state.verified = true;
    state.result = { data: [], error: null };
  });

  it("rejects a short deviceId at the validator boundary", async () => {
    await expect(callServerFn(getNlSuggestions, { ...DEVICE, deviceId: "x" })).rejects.toThrow();
  });

  it("falls back to POI suggestions when there is no history", async () => {
    const out = await callServerFn(getNlSuggestions, { ...DEVICE, hour: 8, dow: 2 });
    expect(out.suggestions).toHaveLength(3);
    for (const s of out.suggestions) expect(s.reason).toBe("fallback");
  });

  it("serves fallbacks even with an invalid device token", async () => {
    state.verified = false;
    const out = await callServerFn(getNlSuggestions, { ...DEVICE, hour: 12, dow: 3 });
    expect(out.suggestions.length).toBeGreaterThan(0);
    expect(out.suggestions.every((s) => s.reason === "fallback")).toBe(true);
  });

  it("surfaces a personal suggestion from trip history matching the current hour", async () => {
    const rows = Array.from({ length: 4 }, () => ({
      to_lat: 35.172,
      to_lng: 33.362,
      to_label: "Eleftheria Square",
      hour: 9,
      dow: 2,
      recorded_at: new Date().toISOString(),
    }));
    state.result = { data: rows, error: null };
    const out = await callServerFn(getNlSuggestions, { ...DEVICE, hour: 9, dow: 2, lat: 35.17, lng: 33.36 });
    expect(out.suggestions.some((s) => s.reason === "personal")).toBe(true);
    expect(out.suggestions.some((s) => s.text.includes("Eleftheria Square"))).toBe(true);
  });

  it("falls back cleanly when the trip_history query errors", async () => {
    state.result = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getNlSuggestions, { ...DEVICE, hour: 10, dow: 1 });
    expect(out.suggestions.length).toBeGreaterThan(0);
  });
});
