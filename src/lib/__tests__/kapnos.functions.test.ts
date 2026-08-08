import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { callServerFn } from "./server-fn";

const NICOSIA_STOP = { lat: 35.17, lng: 33.36 };
const LARNACA_AIRPORT = { lat: 34.875, lng: 33.625 };

function makeRoute() {
  return {
    trip_type_id: "1",
    trip_type_name: "1AT000 - LARNACA > NICOSIA",
    trip_type_location: {
      pickup: [
        {
          point_id: "p1",
          point_name: "Larnaca Airport (A1)",
          point_lat: String(LARNACA_AIRPORT.lat),
          point_lng: String(LARNACA_AIRPORT.lng),
        },
      ],
      dropoff: [
        {
          drop_id: "d1",
          drop_name: "Nicosia - Solomos Sq.",
          drop_lat: String(NICOSIA_STOP.lat),
          drop_lng: String(NICOSIA_STOP.lng),
          drop_range: "01:00:00",
        },
      ],
    },
    trip_type_trips: {
      tripList: [
        {
          trip_id: "t1",
          trip_datetime: "2024-01-01 08:00:00",
          seat_available: 10,
          trip_prices: [{ price: "8", price_formatted: "€8" }],
        },
        {
          trip_id: "t2",
          trip_datetime: "2024-01-01 10:00:00",
          seat_available: 3,
          trip_prices: [{ price: "8", price_formatted: "€8" }],
        },
      ],
    },
  };
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

let mod: typeof import("../kapnos.functions");

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.setSystemTime(new Date("2024-01-01T06:00:00Z"));
  mod = await import("../kapnos.functions");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchKapnosRoutes", () => {
  it("parses the feed into routes", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [makeRoute()] });
    const routes = await mod.fetchKapnosRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.code).toBe("1AT000");
    expect(routes[0]?.pickups[0]?.isAirport).toBe(true);
  });

  it("caches results across calls", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [makeRoute()] });
    await mod.fetchKapnosRoutes();
    await mod.fetchKapnosRoutes();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when fetch fails and no cache", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const routes = await mod.fetchKapnosRoutes();
    expect(routes).toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const routes = await mod.fetchKapnosRoutes();
    expect(routes).toEqual([]);
  });
});

describe("suggestKapnos", () => {
  it("rejects invalid input at the boundary", async () => {
    await expect(
      callServerFn(mod.suggestKapnos, { from: { lat: 1000, lng: 0 }, to: NICOSIA_STOP }),
    ).rejects.toThrow();
  });

  it("returns null when the feed has no routes", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const out = await callServerFn(mod.suggestKapnos, {
      from: LARNACA_AIRPORT,
      to: NICOSIA_STOP,
    });
    expect(out).toBeNull();
  });

  it("suggests a route when the airport/city pair matches", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [makeRoute()] });
    const out = await callServerFn(mod.suggestKapnos, {
      from: LARNACA_AIRPORT,
      to: NICOSIA_STOP,
    });
    expect(out?.routeCode).toBe("1AT000");
    expect(out?.airportIsOrigin).toBe(true);
    expect(out?.departures.length).toBeGreaterThan(0);
  });

  it("filters departures by afterUnix / beforeUnix window", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [makeRoute()] });
    const afterUnix = Math.floor(new Date("2024-01-01T07:30:00Z").getTime() / 1000);
    const out = await callServerFn(mod.suggestKapnos, {
      from: LARNACA_AIRPORT,
      to: NICOSIA_STOP,
      afterUnix,
    });
    expect(out?.departures.every((d) => d.departLocal > "2024-01-01 07:30:00")).toBe(true);
  });

  it("returns null when no candidate is within walking distance", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [makeRoute()] });
    const out = await callServerFn(mod.suggestKapnos, {
      from: { lat: 35.0, lng: 32.5 },
      to: { lat: 35.0, lng: 32.5 },
    });
    expect(out).toBeNull();
  });

  it("returns null when all departures have already left", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [makeRoute()] });
    vi.setSystemTime(new Date("2024-01-02T06:00:00Z"));
    const out = await callServerFn(mod.suggestKapnos, {
      from: LARNACA_AIRPORT,
      to: NICOSIA_STOP,
    });
    expect(out).toBeNull();
  });
});
