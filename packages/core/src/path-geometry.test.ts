import { describe, expect, it } from "vitest";
import {
  cumulativeDistances,
  densifyPath,
  lerp,
  sampleAlong,
  snapAlong,
  spanToZoom,
  vehicleOverlayKey,
} from "./path-geometry";

const A = { lat: 35.17, lng: 33.36 };
const B = { lat: 35.18, lng: 33.36 };
const C = { lat: 35.19, lng: 33.36 };

describe("lerp", () => {
  it("interpolates the endpoints exactly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it("extrapolates past the range", () => {
    expect(lerp(2, 4, 2)).toBe(6);
    expect(lerp(2, 4, -1)).toBe(0);
  });
});

describe("cumulativeDistances", () => {
  it("starts at zero and grows monotonically", () => {
    const cum = cumulativeDistances([A, B, C]);
    expect(cum).toHaveLength(3);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(0);
    expect(cum[2]).toBeGreaterThan(cum[1]);
    // Two equal 0.01° latitude steps → second segment matches the first.
    expect(cum[2] - cum[1]).toBeCloseTo(cum[1], 0);
  });

  it("handles a single-point path", () => {
    expect(cumulativeDistances([A])).toEqual([0]);
  });
});

describe("snapAlong", () => {
  const path = [A, B, C];
  const cum = cumulativeDistances(path);

  it("returns null when the path cannot form a segment", () => {
    expect(snapAlong(A, [], [])).toBeNull();
    expect(snapAlong(A, [A], [0])).toBeNull();
  });

  it("snaps a point on the line with near-zero perpendicular error", () => {
    const mid = { lat: 35.175, lng: 33.36 };
    const snapped = snapAlong(mid, path, cum);
    expect(snapped).not.toBeNull();
    expect(snapped!.perpM).toBeLessThan(1);
    expect(snapped!.segIndex).toBe(0);
    expect(snapped!.along).toBeCloseTo(cum[1] / 2, 0);
  });

  it("reports perpendicular offset for a point beside the line", () => {
    const beside = { lat: 35.18, lng: 33.363 };
    const snapped = snapAlong(beside, path, cum)!;
    expect(snapped.perpM).toBeGreaterThan(200);
    expect(snapped.perpM).toBeLessThan(320);
  });

  it("clamps a point past the end to the final vertex", () => {
    const past = { lat: 35.3, lng: 33.36 };
    const snapped = snapAlong(past, path, cum)!;
    expect(snapped.along).toBeCloseTo(cum[cum.length - 1], 0);
  });
});

describe("densifyPath", () => {
  it("passes short paths through untouched", () => {
    expect(densifyPath([], 25)).toEqual([]);
    expect(densifyPath([A], 25)).toEqual([A]);
  });

  it("leaves segments shorter than the ceiling alone", () => {
    expect(densifyPath([A, B], 5000)).toEqual([A, B]);
  });

  it("subdivides long segments below the ceiling", () => {
    const out = densifyPath([A, C], 25);
    expect(out.length).toBeGreaterThan(80);
    expect(out[0]).toEqual(A);
    expect(out[out.length - 1]).toEqual(C);
    const cum = cumulativeDistances(out);
    const maxStep = Math.max(...cum.slice(1).map((v, i) => v - cum[i]));
    expect(maxStep).toBeLessThanOrEqual(25.5);
  });
});

describe("sampleAlong", () => {
  const path = [A, B, C];
  const cum = cumulativeDistances(path);

  it("returns the start and end for clamped inputs", () => {
    const start = sampleAlong(path, cum, -100);
    expect(start.lat).toBeCloseTo(A.lat, 6);
    const end = sampleAlong(path, cum, cum[2] + 5000);
    expect(end.lat).toBeCloseTo(C.lat, 6);
  });

  it("interpolates the midpoint of a segment", () => {
    const mid = sampleAlong(path, cum, cum[1] / 2);
    expect(mid.lat).toBeCloseTo((A.lat + B.lat) / 2, 5);
  });

  it("reports a due-north bearing for a northbound path", () => {
    const s = sampleAlong(path, cum, cum[1] / 2);
    expect(s.bearing).toBeCloseTo(0, 3);
  });

  it("reports a due-east bearing for an eastbound path", () => {
    const east = [A, { lat: A.lat, lng: A.lng + 0.02 }];
    const s = sampleAlong(east, cumulativeDistances(east), 10);
    expect(s.bearing).toBeCloseTo(90, 1);
  });
});

describe("spanToZoom", () => {
  it("maps an 8 km span to zoom 12", () => {
    expect(spanToZoom(8)).toBe(12);
  });

  it("zooms in for tighter spans and out for wider ones", () => {
    expect(spanToZoom(2)).toBeGreaterThan(spanToZoom(8));
    expect(spanToZoom(60)).toBeLessThan(spanToZoom(8));
  });

  it("clamps to the usable range", () => {
    expect(spanToZoom(0.001)).toBe(17);
    expect(spanToZoom(5000)).toBe(6);
  });
});

describe("vehicleOverlayKey", () => {
  it("prefers the trip id", () => {
    expect(vehicleOverlayKey({ id: "e1", tripId: "t1", routeId: "r1", label: "30" })).toBe(
      "trip:t1",
    );
  });

  it("falls back to route + label", () => {
    expect(vehicleOverlayKey({ id: "e1", routeId: "r1", label: "30" })).toBe("route:r1:label:30");
  });

  it("falls back to the entity id", () => {
    expect(vehicleOverlayKey({ id: "e1", routeId: "r1" })).toBe("entity:e1");
    expect(vehicleOverlayKey({ id: "e2", tripId: null, routeId: null, label: null })).toBe(
      "entity:e2",
    );
  });
});
