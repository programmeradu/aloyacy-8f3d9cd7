import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { result: TableResult } = { result: { data: [], error: null } };

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    pulse_signals: () => state.result,
  });
  return { supabaseAdmin: client };
});

const { getItineraryTrafficAlerts } = await import("../traffic-alerts.functions");

const NICOSIA = { lat: 35.1856, lng: 33.3823 };

function incident(over: Record<string, unknown> = {}) {
  return {
    id: "inc-1",
    severity: "high",
    headline: "Closure on Makarios Ave",
    lat: NICOSIA.lat,
    lng: NICOSIA.lng,
    ...over,
  };
}

function row(incidents: unknown[], ageMs = 0) {
  return {
    scope: "island",
    payload: { incidents },
    fetched_at: new Date(Date.now() - ageMs).toISOString(),
  };
}

describe("getItineraryTrafficAlerts", () => {
  beforeEach(() => {
    state.result = { data: [], error: null };
  });

  it("rejects an empty point list at the validator boundary", async () => {
    await expect(callServerFn(getItineraryTrafficAlerts, { points: [] })).rejects.toThrow();
  });

  it("rejects more sample points than the cap allows", async () => {
    const points = Array.from({ length: 65 }, () => NICOSIA);
    await expect(callServerFn(getItineraryTrafficAlerts, { points })).rejects.toThrow();
  });

  it("returns null when the feed has no incidents", async () => {
    expect(await callServerFn(getItineraryTrafficAlerts, { points: [NICOSIA] })).toBeNull();
  });

  it("returns null when the query errors", async () => {
    state.result = { data: null, error: { message: "boom" } };
    expect(await callServerFn(getItineraryTrafficAlerts, { points: [NICOSIA] })).toBeNull();
  });

  it("surfaces an incident that sits on the itinerary", async () => {
    state.result = { data: [row([incident()])], error: null };
    const out = await callServerFn(getItineraryTrafficAlerts, { points: [NICOSIA] });
    expect(out?.highest).toBe("high");
    expect(out?.alerts).toHaveLength(1);
    expect(out?.alerts[0]?.distanceFromPathM).toBeGreaterThanOrEqual(0);
    expect(out?.observedAt).toBeTruthy();
  });

  it("drops incidents far away from every sample point", async () => {
    state.result = {
      data: [row([incident({ lat: 34.6841, lng: 33.0379 })])],
      error: null,
    };
    expect(await callServerFn(getItineraryTrafficAlerts, { points: [NICOSIA] })).toBeNull();
  });

  it("dedups by incident id and ranks by severity", async () => {
    state.result = {
      data: [
        row([
          incident({ id: "a", severity: "low" }),
          incident({ id: "a", severity: "low" }),
          incident({ id: "b", severity: "high" }),
        ]),
      ],
      error: null,
    };
    const out = await callServerFn(getItineraryTrafficAlerts, { points: [NICOSIA] });
    expect(out?.alerts.map((a) => a.id)).toEqual(["b", "a"]);
    expect(out?.highest).toBe("high");
  });

  it("caps the number of surfaced alerts", async () => {
    const many = Array.from({ length: 10 }, (_, i) => incident({ id: `i-${i}` }));
    state.result = { data: [row(many)], error: null };
    const out = await callServerFn(getItineraryTrafficAlerts, { points: [NICOSIA] });
    expect(out?.alerts.length).toBeLessThanOrEqual(4);
  });
});
