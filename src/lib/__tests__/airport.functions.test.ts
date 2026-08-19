import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";
import type { KapnosRoute } from "../kapnos.functions";

const state: { pulseSignals: TableResult } = {
  pulseSignals: { data: null, error: null },
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    pulse_signals: () => state.pulseSignals,
  });
  return { supabaseAdmin: client };
});

const fetchKapnosRoutesMock = vi.fn<() => Promise<KapnosRoute[]>>();
vi.mock("../kapnos.functions", () => ({
  fetchKapnosRoutes: () => fetchKapnosRoutesMock(),
}));

const { getAirportPage, AIRPORTS } = await import("../airport.functions");

// Far in the future so trips are always "upcoming" relative to real now().
const FUTURE = "2099-01-01 10:00:00";
const PAST = "2000-01-01 10:00:00";

function route(overrides: Partial<KapnosRoute> = {}): KapnosRoute {
  return {
    id: "route-1",
    code: "1AT000",
    name: "LARNACA > NICOSIA",
    pickups: [{ id: "p1", name: "LARNACA AIRPORT (LCA)", lat: 34.87, lng: 33.62, isAirport: true }],
    dropoffs: [
      {
        id: "d1",
        name: "NICOSIA - SOLOMOS SQ.",
        lat: 35.17,
        lng: 33.36,
        isAirport: false,
        rangeFromStart: "00:45:00",
      },
    ],
    trips: [
      {
        tripId: "t1",
        departLocal: FUTURE,
        seatsAvailable: 10,
        priceFromRaw: "8",
        priceFromFormatted: "€8",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  fetchKapnosRoutesMock.mockReset();
  state.pulseSignals = { data: null, error: null };
});

describe("getAirportPage", () => {
  it("rejects an unknown airport code", async () => {
    await expect(callServerFn(getAirportPage, { code: "xyz" as never })).rejects.toThrow();
  });

  it("builds a coach line for a route boarding at the requested airport", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([route()]);
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.airport).toEqual(AIRPORTS.lca);
    expect(out.coachLines).toHaveLength(1);
    const line = out.coachLines[0]!;
    expect(line.destinationCity).toBe("Nicosia");
    expect(line.pickupName).toContain("LARNACA AIRPORT");
    expect(line.rideMin).toBe(45);
    expect(line.priceFrom).toBe("€8");
    expect(line.nextDepartures).toHaveLength(1);
    expect(line.nextDepartures[0]?.depart).toBe("10:00");
    expect(line.nextDepartures[0]?.arrive).toBe("10:45");
  });

  it("skips routes that do not pick up at this airport", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([
      route({
        pickups: [{ id: "p1", name: "NICOSIA CENTRE", lat: 35.17, lng: 33.36, isAirport: false }],
      }),
    ]);
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.coachLines).toEqual([]);
  });

  it("skips routes whose dropoffs are all at the airport", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([
      route({
        dropoffs: [{ id: "d1", name: "PAPHOS AIRPORT", lat: 34.7, lng: 32.4, isAirport: true }],
      }),
    ]);
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.coachLines).toEqual([]);
  });

  it("skips routes with no upcoming departures", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([
      route({
        trips: [
          {
            tripId: "t1",
            departLocal: PAST,
            seatsAvailable: 10,
            priceFromRaw: "8",
            priceFromFormatted: "€8",
          },
        ],
      }),
    ]);
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.coachLines).toEqual([]);
  });

  it("sorts coach lines by ride time ascending", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([
      route({
        id: "slow",
        dropoffs: [
          {
            id: "d1",
            name: "PAPHOS - CENTRE",
            lat: 34.77,
            lng: 32.43,
            isAirport: false,
            rangeFromStart: "02:00:00",
          },
        ],
        name: "LARNACA > PAPHOS",
      }),
      route({
        id: "fast",
        dropoffs: [
          {
            id: "d2",
            name: "LARNACA - CENTRE",
            lat: 34.9,
            lng: 33.6,
            isAirport: false,
            rangeFromStart: "00:15:00",
          },
        ],
        name: "LARNACA AIRPORT > LARNACA",
      }),
    ]);
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.coachLines.map((l) => l.routeId)).toEqual(["fast", "slow"]);
  });

  it("swallows a Kapnos feed failure and returns no coach lines", async () => {
    fetchKapnosRoutesMock.mockRejectedValue(new Error("feed down"));
    const out = await callServerFn(getAirportPage, { code: "pfo" });
    expect(out.coachLines).toEqual([]);
  });

  it("returns null flights when no pulse_signals row exists", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([]);
    state.pulseSignals = { data: null, error: null };
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.flights).toBeNull();
  });

  it("returns null flights when the row error out", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([]);
    state.pulseSignals = { data: null, error: { message: "boom" } };
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.flights).toBeNull();
  });

  it("returns null flights when the cached row is stale beyond its ttl", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([]);
    state.pulseSignals = {
      data: {
        payload: { arrivalsNext60: 3, departuresNext60: 2, summary: "busy" },
        fetched_at: new Date(Date.now() - 3_600_000).toISOString(),
        ttl_seconds: 60,
        source: "opensky",
      },
      error: null,
    };
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.flights).toBeNull();
  });

  it("maps a fresh flights row into the response shape", async () => {
    fetchKapnosRoutesMock.mockResolvedValue([]);
    state.pulseSignals = {
      data: {
        payload: {
          arrivalsNext60: 3,
          departuresNext60: 2,
          summary: "3 arrivals, 2 departures",
          arrivals: [
            { callsign: "CYP123", otherAirport: "LHR", scheduled: "2024-01-01T10:00:00Z" },
          ],
          departures: [
            { callsign: "CYP456", otherAirport: "FRA", scheduled: "2024-01-01T11:00:00Z" },
          ],
        },
        fetched_at: new Date().toISOString(),
        ttl_seconds: 900,
        source: "opensky",
      },
      error: null,
    };
    const out = await callServerFn(getAirportPage, { code: "lca" });
    expect(out.flights?.arrivalsNext60).toBe(3);
    expect(out.flights?.departuresNext60).toBe(2);
    expect(out.flights?.summary).toBe("3 arrivals, 2 departures");
    expect(out.flights?.arrivals[0]?.callsign).toBe("CYP123");
    expect(out.flights?.departures[0]?.callsign).toBe("CYP456");
    expect(out.flights?.source).toBe("opensky");
  });
});
