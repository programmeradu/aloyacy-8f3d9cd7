import { describe, expect, it } from "vitest";
import {
  applyOverrides,
  buildTripPaths,
  overrideSignature,
  selectMapVehicles,
  type MapVehicle,
} from "./map-vehicles";

const bus = (over: Partial<MapVehicle> & { tripId: string }): MapVehicle => ({
  id: `v-${over.tripId}`,
  routeId: "R1",
  lat: 35,
  lng: 33,
  ...over,
});

describe("overrideSignature", () => {
  it("is stable regardless of key order", () => {
    const a = overrideSignature({ t1: { lat: 35, lng: 33 }, t2: { lat: 36, lng: 34 } });
    const b = overrideSignature({ t2: { lat: 36, lng: 34 }, t1: { lat: 35, lng: 33 } });
    expect(a).toBe(b);
  });

  it("ignores sub-metre jitter so the layer does not rebuild every GPS tick", () => {
    const a = overrideSignature({ t1: { lat: 35.000001, lng: 33.000001 } });
    const b = overrideSignature({ t1: { lat: 35.000002, lng: 33.000002 } });
    expect(a).toBe(b);
  });

  it("changes when the bus actually moves", () => {
    const a = overrideSignature({ t1: { lat: 35, lng: 33 } });
    const b = overrideSignature({ t1: { lat: 35.01, lng: 33 } });
    expect(a).not.toBe(b);
  });
});

describe("applyOverrides", () => {
  it("returns the feed untouched when there is nothing to fuse", () => {
    const list = [bus({ tripId: "t1" })];
    expect(applyOverrides(list, undefined)).toBe(list);
  });

  it("fuses rider position into a matching feed vehicle", () => {
    const [v] = applyOverrides([bus({ tripId: "t1", bearing: 10 })], {
      t1: { lat: 35.5, lng: 33.5, source: "rider" },
    });
    expect(v).toMatchObject({ lat: 35.5, lng: 33.5, bearing: 10, source: "rider" });
  });

  it("synthesizes a vehicle for a trip the feed has not reported", () => {
    const out = applyOverrides([], { t9: { lat: 34.7, lng: 32.4, label: "Route 30" } }, 1_700);
    expect(out).toEqual([
      expect.objectContaining({
        tripId: "t9",
        lat: 34.7,
        label: "Route 30",
        source: "synthetic",
        timestamp: 1_700,
      }),
    ]);
  });
});

describe("selectMapVehicles", () => {
  const fleet = [
    bus({ tripId: "t1", routeId: "R1" }),
    bus({ tripId: "t2", routeId: "R2" }),
    bus({ tripId: "t3", routeId: "R2" }),
  ];

  it("shows the whole fleet with no focus or restriction", () => {
    expect(selectMapVehicles({ vehicles: fleet })).toHaveLength(3);
  });

  it("shows only the focused trip", () => {
    const out = selectMapVehicles({ vehicles: fleet, focusTripId: "t2" });
    expect(out.map((v) => v.tripId)).toEqual(["t2"]);
  });

  it("falls back to a synthetic override when the focused trip left the feed", () => {
    const out = selectMapVehicles({
      vehicles: fleet,
      focusTripId: "gone",
      overrides: { gone: { lat: 35.1, lng: 33.1, source: "rider" } },
    });
    expect(out.map((v) => v.tripId)).toEqual(["gone"]);
  });

  it("falls back to the route when neither the trip nor an override matches", () => {
    const out = selectMapVehicles({ vehicles: fleet, focusTripId: "gone", focusRouteId: "R2" });
    expect(out.map((v) => v.tripId)).toEqual(["t2", "t3"]);
  });

  it("returns nothing rather than the wrong bus when the focus cannot be resolved", () => {
    expect(selectMapVehicles({ vehicles: fleet, focusTripId: "gone" })).toEqual([]);
  });

  it("restricts to the given trips", () => {
    const out = selectMapVehicles({ vehicles: fleet, restrictTripIds: ["t1", "t3"] });
    expect(out.map((v) => v.tripId)).toEqual(["t1", "t3"]);
  });

  it("ignores an empty restriction list instead of blanking the map", () => {
    expect(selectMapVehicles({ vehicles: fleet, restrictTripIds: [] })).toHaveLength(3);
  });
});

describe("buildTripPaths", () => {
  const stops: Record<string, { lat: number; lng: number }> = {
    s1: { lat: 35.1, lng: 33.1 },
    s2: { lat: 35.2, lng: 33.2 },
    s3: { lat: 35.3, lng: 33.3 },
  };

  const base = {
    stopFor: (id: string) => stops[id],
    agencyForRoute: () => "nicosia",
  };

  it("prefers the real GTFS shape over stop-derived geometry", () => {
    const shape = [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ];
    const out = buildTripPaths({
      ...base,
      vehicles: [bus({ tripId: "t1" })],
      arrivals: [
        { tripId: "t1", routeId: "R1", stopId: "s1", arrivalUnix: 10 },
        { tripId: "t1", routeId: "R1", stopId: "s2", arrivalUnix: 20 },
      ],
      shapeFor: () => shape,
    });
    expect(out.get("t1")).toBe(shape);
  });

  it("stitches stops in arrival order when no shape exists", () => {
    const out = buildTripPaths({
      ...base,
      vehicles: [],
      arrivals: [
        { tripId: "t1", routeId: "R1", stopId: "s3", arrivalUnix: 300 },
        { tripId: "t1", routeId: "R1", stopId: "s1", arrivalUnix: 100 },
        { tripId: "t1", routeId: "R1", stopId: "s2", arrivalUnix: 200 },
      ],
      shapeFor: () => null,
    });
    expect(out.get("t1")).toEqual([stops.s1, stops.s2, stops.s3]);
  });

  it("skips trips that resolve to a single point", () => {
    const out = buildTripPaths({
      ...base,
      vehicles: [],
      arrivals: [{ tripId: "t1", routeId: "R1", stopId: "s1", arrivalUnix: 100 }],
      shapeFor: () => null,
    });
    expect(out.has("t1")).toBe(false);
  });

  it("drops unknown stop IDs without breaking the rest of the path", () => {
    const out = buildTripPaths({
      ...base,
      vehicles: [],
      arrivals: [
        { tripId: "t1", routeId: "R1", stopId: "s1", arrivalUnix: 100 },
        { tripId: "t1", routeId: "R1", stopId: "nope", arrivalUnix: 150 },
        { tripId: "t1", routeId: "R1", stopId: "s2", arrivalUnix: 200 },
      ],
      shapeFor: () => null,
    });
    expect(out.get("t1")).toEqual([stops.s1, stops.s2]);
  });
});
