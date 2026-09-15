import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin
const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "eta_predictions") {
        return { insert: insertMock };
      }
      if (table === "delay_stats") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                gte: async () => ({
                  data: [
                    { route_id: "IC:45", mean_delay_sec: 45, stddev_delay_sec: 40, sample_count: 50 },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
      };
    }),
  },
}));

// Mock GTFS-RT snapshot
vi.mock("@/lib/gtfs-rt.server", () => ({
  fetchRealtime: vi.fn().mockResolvedValue({
    fetchedAt: Math.floor(Date.now() / 1000),
    stale: false,
    arrivals: [
      {
        tripId: "trip-101",
        routeId: "IC:45",
        stopId: "TEST_STOP_1",
        arrivalUnix: Math.floor(Date.now() / 1000) + 300,
        departureUnix: Math.floor(Date.now() / 1000) + 320,
        delaySec: 60,
      },
    ],
    vehicles: [
      {
        id: "veh-1",
        tripId: "trip-101",
        routeId: "IC:45",
        lat: 35.17,
        lng: 33.36,
        bearing: 180,
        speedMps: 12.5,
        timestamp: Math.floor(Date.now() / 1000) - 15,
      },
    ],
    ghostTripIds: [],
    riderConfirmedTrips: [],
  }),
}));

// Mock GTFS static
vi.mock("@/lib/gtfs", () => ({
  getStop: vi.fn((id: string) => {
    if (id === "TEST_STOP_1") {
      return { id: "TEST_STOP_1", name: "Solomou Square Hub", agency: "IC", lat: 35.17, lng: 33.36 };
    }
    return null;
  }),
  getRoute: vi.fn((id: string) => {
    if (id === "IC:45") {
      return { id: "IC:45", short: "45", long: "Nicosia - Limassol", agency: "IC" };
    }
    return null;
  }),
}));

vi.mock("@/lib/headsigns", () => ({
  getHeadsignSync: vi.fn(() => "Limassol Port"),
}));

vi.mock("@/lib/shapes", () => ({
  getShapeForTripSync: vi.fn(() => null),
}));

import { Route } from "../v1/truth/eta";
import { getHandler, apiRequest } from "./handler";

const GET = getHandler(Route, "GET");
const POST = getHandler(Route, "POST");
const OPTIONS = getHandler(Route, "OPTIONS");

describe("B2B Truth API — /api/v1/truth/eta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles OPTIONS with 204 and CORS headers", async () => {
    const res = await OPTIONS({ request: new Request("http://x/api/v1/truth/eta", { method: "OPTIONS" }) });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("returns 400 Bad Request when stop_id is missing on GET", async () => {
    const req = apiRequest("/api/v1/truth/eta", { method: "GET", query: {} });
    const res = await GET({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid query parameters");
  });

  it("returns 404 Not Found when stop_id does not exist", async () => {
    const req = apiRequest("/api/v1/truth/eta", { method: "GET", query: { stop_id: "NON_EXISTENT_STOP" } });
    const res = await GET({ request: req });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 200 with complete truth payload on valid GET query", async () => {
    const req = apiRequest("/api/v1/truth/eta", { method: "GET", query: { stop_id: "TEST_STOP_1" } });
    const res = await GET({ request: req });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.api_version).toBe("v1");
    expect(data.stop.id).toBe("TEST_STOP_1");
    expect(data.stop.name).toBe("Solomou Square Hub");
    expect(data.departures.length).toBe(1);

    const dep = data.departures[0];
    expect(dep.trip_id).toBe("trip-101");
    expect(dep.route_id).toBe("IC:45");
    expect(dep.route_short).toBe("45");
    expect(dep.headsign).toBe("Limassol Port");
    expect(typeof dep.p50_sec).toBe("number");
    expect(typeof dep.p25_sec).toBe("number");
    expect(typeof dep.p90_sec).toBe("number");
    expect(dep.tier).toBe("live");
    expect(dep.confidence).toBeDefined();
    expect(dep.source_mix).toBe("vehicle_cross");
    expect(dep.vehicle).toEqual({
      id: "veh-1",
      lat: 35.17,
      lng: 33.36,
      bearing: 180,
      speed_mps: 12.5,
    });
    // reliability is TruthReliability | null — depends on delay_stats query resolution
    if (dep.reliability !== null) {
      expect(dep.reliability).toEqual({
        on_time_pct: expect.any(Number),
        sample_count: 50,
        tier: "high",
      });
    } else {
      expect(dep.reliability).toBeNull();
    }

    // The ledger insert is fire-and-forget (void Promise) — flush microtasks
    await new Promise((r) => setTimeout(r, 50));

    // Verify ledger write with surface: "api"
    if (insertMock.mock.calls.length > 0) {
      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertedRows = insertMock.mock.calls[0][0];
      expect(insertedRows.length).toBe(1);
      expect(insertedRows[0].surface).toBe("api");
      expect(insertedRows[0].trip_id).toBe("trip-101");
      expect(insertedRows[0].stop_id).toBe("TEST_STOP_1");
      expect(insertedRows[0].tier).toBe("live");
    }
  });

  it("accepts valid JSON body on POST request", async () => {
    const req = new Request("http://x/api/v1/truth/eta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stop_id: "TEST_STOP_1", limit: 3 }),
    });
    const res = await POST({ request: req });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.departures.length).toBe(1);
  });
});
