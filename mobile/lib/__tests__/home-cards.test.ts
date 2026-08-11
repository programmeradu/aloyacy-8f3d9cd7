import { beforeEach, describe, expect, it } from "vitest";
import { nearbyStops, buildStopCards } from "@/lib/home-cards";
import { setStops } from "@/lib/gtfs";
import type { RealtimeArrival, RealtimeVehicle, Stop } from "@/lib/api";

const NOW = 1_000_000;

const stops: Stop[] = [
  { id: "s1", code: "S1", name: "Near", lat: 35.0, lng: 33.0, agency: "urban" },
  { id: "s2", code: "S2", name: "Far", lat: 35.5, lng: 33.5, agency: "urban" },
  { id: "s3", code: "S3", name: "Intercity", lat: 35.2, lng: 33.2, agency: "IC" },
];

beforeEach(() => setStops(stops));

describe("nearbyStops", () => {
  it("returns an empty array when there are no stops", () => {
    expect(nearbyStops({ lat: 35.0, lng: 33.0 }, undefined)).toEqual([]);
    expect(nearbyStops({ lat: 35.0, lng: 33.0 }, [])).toEqual([]);
  });

  it("sorts stops by distance from 'here' and applies the limit", () => {
    const result = nearbyStops({ lat: 35.0, lng: 33.0 }, stops, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s1");
    expect(result[0].d).toBeLessThan(result[1].d);
  });

  it("defaults to a limit of 6", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`, code: `X${i}`, name: `Stop ${i}`, lat: 35 + i * 0.01, lng: 33, agency: "urban",
    }));
    expect(nearbyStops({ lat: 35, lng: 33 }, many)).toHaveLength(6);
  });
});

describe("buildStopCards", () => {
  const arrival = (over: Partial<RealtimeArrival> = {}): RealtimeArrival => ({
    stopId: "s1", routeId: "r1", tripId: "t1", arrivalUnix: NOW + 300, delaySec: 0, ...over,
  });

  it("builds a card per nearby stop, marking the first one highlighted", () => {
    const nearby = nearbyStops({ lat: 35.0, lng: 33.0 }, stops, 3);
    const cards = buildStopCards({
      nearby,
      arrivals: [],
      vehicles: [],
      routes: {},
      riderConfirmedAge: new Map(),
      nowSec: NOW,
    });
    expect(cards).toHaveLength(3);
    expect(cards[0].highlight).toBe(true);
    expect(cards.slice(1).every((c) => !c.highlight)).toBe(true);
  });

  it("labels distance for urban stops and 'Intercity' for IC stops", () => {
    const nearby = nearbyStops({ lat: 35.0, lng: 33.0 }, stops, 3);
    const cards = buildStopCards({
      nearby, arrivals: [], vehicles: [], routes: {}, riderConfirmedAge: new Map(), nowSec: NOW,
    });
    const ic = cards.find((c) => c.id === "s3")!;
    const urban = cards.find((c) => c.id === "s1")!;
    expect(ic.towards).toBe("Intercity");
    expect(urban.towards).toMatch(/m|km/);
  });

  it("falls back to the raw arrival etaMin when smartEtaV2 can't compute one", () => {
    const nearby = nearbyStops({ lat: 35.0, lng: 33.0 }, [stops[0]], 1);
    const cards = buildStopCards({
      nearby,
      arrivals: [arrival()],
      vehicles: [],
      routes: {},
      riderConfirmedAge: new Map(),
      nowSec: NOW,
    });
    expect(cards[0].etaMin).not.toBeNull();
  });

  it("returns a null etaMin when there is no arrival data for a stop", () => {
    const nearby = nearbyStops({ lat: 35.0, lng: 33.0 }, [stops[1]], 1);
    const cards = buildStopCards({
      nearby, arrivals: [], vehicles: [], routes: {}, riderConfirmedAge: new Map(), nowSec: NOW,
    });
    expect(cards[0].etaMin).toBeNull();
    expect(cards[0].routes).toEqual([{ code: "—", tone: "olive", headsign: null }]);
  });

  it("uses the rider-confirmed age keyed by the nearest arrival's tripId", () => {
    const nearby = nearbyStops({ lat: 35.0, lng: 33.0 }, [stops[0]], 1);
    const cards = buildStopCards({
      nearby,
      arrivals: [arrival({ tripId: "t1" })],
      vehicles: [],
      routes: {},
      riderConfirmedAge: new Map([["t1", 5]]),
      nowSec: NOW,
    });
    expect(cards[0].etaTier).toBe("rider-confirmed");
  });

  it("maps route metadata into chip codes", () => {
    const nearby = nearbyStops({ lat: 35.0, lng: 33.0 }, [stops[0]], 1);
    const cards = buildStopCards({
      nearby,
      arrivals: [arrival({ routeId: "r1" })],
      vehicles: [],
      routes: { r1: { short: "1A", long: "Route 1A" } },
      riderConfirmedAge: new Map(),
      nowSec: NOW,
    });
    expect(cards[0].routes[0].code).toBe("1A");
  });

  it("uses the stop code, or falls back to id when code is missing", () => {
    const bare: Stop = { id: "sX", code: "", name: "Bare", lat: 35.0, lng: 33.0, agency: "urban" };
    setStops([bare]);
    const nearby = nearbyStops({ lat: 35.0, lng: 33.0 }, [bare], 1);
    const cards = buildStopCards({
      nearby, arrivals: [], vehicles: [], routes: {}, riderConfirmedAge: new Map(), nowSec: NOW,
    });
    expect(cards[0].code).toBe("sX");
  });
});
