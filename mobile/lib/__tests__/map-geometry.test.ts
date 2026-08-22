import { describe, expect, it } from "vitest";
import { decodePolyline, filterVehicles, spanToZoom } from "../map-geometry";
import type { RealtimeVehicle } from "../api";

function vehicle(over: Partial<RealtimeVehicle> & { tripId: string }): RealtimeVehicle {
  return {
    id: over.tripId,
    routeId: "R1",
    lat: 35,
    lng: 33,
    bearing: 0,
    speed: 0,
    label: "",
    timestamp: 1,
    source: "feed",
    ...over,
  } as RealtimeVehicle;
}

describe("decodePolyline", () => {
  it("decodes Google's reference polyline", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toHaveLength(3);
    expect(pts[0]!.lat).toBeCloseTo(38.5, 5);
    expect(pts[0]!.lng).toBeCloseTo(-120.2, 5);
    expect(pts[2]!.lat).toBeCloseTo(43.252, 3);
    expect(pts[2]!.lng).toBeCloseTo(-126.453, 3);
  });

  it("returns nothing for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("spanToZoom", () => {
  it("zooms in for a tight span and out for the whole island", () => {
    expect(spanToZoom(8)).toBe(12);
    expect(spanToZoom(1)).toBeGreaterThan(spanToZoom(50));
  });

  it("clamps to the usable range even for absurd inputs", () => {
    expect(spanToZoom(0)).toBe(17);
    expect(spanToZoom(-5)).toBe(17);
    expect(spanToZoom(100_000)).toBe(6);
  });
});

describe("filterVehicles", () => {
  const base = [vehicle({ tripId: "t1" }), vehicle({ tripId: "t2", routeId: "R2" })];

  it("passes the feed through untouched with no filters", () => {
    expect(filterVehicles(base, undefined).map((v) => v.tripId)).toEqual(["t1", "t2"]);
  });

  it("narrows to a focused trip", () => {
    expect(filterVehicles(base, undefined, "t2").map((v) => v.tripId)).toEqual(["t2"]);
  });

  it("falls back to the focused route when the trip has no vehicle", () => {
    expect(filterVehicles(base, undefined, "missing", "R2").map((v) => v.tripId)).toEqual(["t2"]);
  });

  it("returns nothing when neither the focused trip nor route is present", () => {
    expect(filterVehicles(base, undefined, "missing", "R9")).toEqual([]);
  });

  it("honours a restrict list", () => {
    expect(filterVehicles(base, undefined, undefined, undefined, ["t2"]).map((v) => v.tripId)).toEqual(
      ["t2"],
    );
  });

  it("applies a rider override on top of the feed position", () => {
    const [v] = filterVehicles(base, { t1: { lat: 1, lng: 2, source: "rider" } }, "t1");
    expect(v).toMatchObject({ tripId: "t1", lat: 1, lng: 2, source: "rider" });
  });

  it("synthesises a vehicle for an override the feed does not carry", () => {
    const out = filterVehicles(base, { t9: { lat: 3, lng: 4, routeId: "R9" } }, "t9");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tripId: "t9", lat: 3, lng: 4, source: "synthetic" });
  });

  it("keeps override edits when the map is unfiltered", () => {
    const out = filterVehicles(base, { t2: { lat: 9, lng: 9 } });
    expect(out.map((v) => v.tripId)).toEqual(["t1", "t2"]);
    expect(out[1]).toMatchObject({ lat: 9, lng: 9 });
  });
});
