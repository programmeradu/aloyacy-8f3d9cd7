import { describe, it, expect } from "vitest";
import { nearbyStops, buildStopCards } from "../home-cards";
import type { Stop, RealtimeArrival, RealtimeVehicle } from "../api";

const here = { lat: 35.0, lng: 33.0 };

const stop = (over: Partial<Stop> = {}): Stop =>
  ({ id: "s1", code: "S1", name: "Stop 1", agency: "OSEL", lat: 35.001, lng: 33.001, ...over }) as Stop;

describe("nearbyStops", () => {
  it("returns [] when stops is undefined or empty", () => {
    expect(nearbyStops(here, undefined)).toEqual([]);
    expect(nearbyStops(here, [])).toEqual([]);
  });

  it("returns nearest stops sorted by distance, limited", () => {
    const far = stop({ id: "far", lat: 36, lng: 34 });
    const near = stop({ id: "near", lat: 35.0005, lng: 33.0005 });
    const res = nearbyStops(here, [far, near], 1);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("near");
  });
});

describe("buildStopCards", () => {
  it("builds a card per nearby stop with distance label and fallback route chip", () => {
    const nearby = [{ ...stop(), d: 120 }];
    const arrivals: RealtimeArrival[] = [];
    const vehicles: RealtimeVehicle[] = [];
    const cards = buildStopCards({
      nearby,
      arrivals,
      vehicles,
      routes: {},
      riderConfirmedAge: new Map(),
      nowSec: 1000,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("s1");
    expect(cards[0].towards).toBe("120 m");
    expect(cards[0].etaMin).toBeNull();
    expect(cards[0].routes).toEqual([{ code: "—", tone: "olive", headsign: null }]);
    expect(cards[0].highlight).toBe(true);
  });

  it("labels intercity (IC) stops as 'Intercity' instead of a distance", () => {
    const nearby = [{ ...stop({ agency: "IC" }), d: 5000 }];
    const cards = buildStopCards({
      nearby,
      arrivals: [],
      vehicles: [],
      routes: {},
      riderConfirmedAge: new Map(),
      nowSec: 1000,
    });
    expect(cards[0].towards).toBe("Intercity");
  });

  it("surfaces smartEta-derived tier/confidence/blurb and route chips when arrivals exist", () => {
    const nearby = [{ ...stop(), d: 50 }];
    const arrivals: RealtimeArrival[] = [
      { stopId: "s1", routeId: "r1", tripId: "trip1", arrivalUnix: 1300, delaySec: 0 },
    ];
    const cards = buildStopCards({
      nearby,
      arrivals,
      vehicles: [],
      routes: { r1: { short: "1", long: "Route One" } },
      riderConfirmedAge: new Map(),
      nowSec: 1000,
    });
    expect(cards[0].routes[0]).toMatchObject({ code: "1" });
    expect(cards[0].etaMin).not.toBeNull();
    expect(cards[0].highlight).toBe(true);
  });
});
