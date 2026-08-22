import { describe, expect, it } from "vitest";

import {
  bearingDeg,
  compassLabel,
  distanceM,
  polylineLengthM,
  projectOnSteps,
  snapToPolyline,
  WALK_M_PER_S,
  type LatLng,
  type WalkStep,
} from "./geo";

const SOLOMOS: LatLng = { lat: 35.174, lng: 33.365 };
const FINIKOUDES: LatLng = { lat: 34.9183, lng: 33.6354 };

describe("distanceM", () => {
  it("is zero for the same point", () => {
    expect(distanceM(SOLOMOS, SOLOMOS)).toBe(0);
  });

  it("matches the known Nicosia → Larnaca great-circle distance", () => {
    // ~37.6 km as the crow flies; allow ~1% for radius rounding.
    const km = distanceM(SOLOMOS, FINIKOUDES) / 1000;
    expect(km).toBeGreaterThan(37.2);
    expect(km).toBeLessThan(38);
  });

  it("is symmetric", () => {
    expect(distanceM(SOLOMOS, FINIKOUDES)).toBeCloseTo(
      distanceM(FINIKOUDES, SOLOMOS),
      6,
    );
  });

  it("resolves sub-metre offsets", () => {
    const shifted = { lat: SOLOMOS.lat + 0.00001, lng: SOLOMOS.lng };
    expect(distanceM(SOLOMOS, shifted)).toBeGreaterThan(0.5);
    expect(distanceM(SOLOMOS, shifted)).toBeLessThan(2);
  });
});

describe("bearingDeg", () => {
  it("returns 0 for due north", () => {
    expect(bearingDeg(SOLOMOS, { lat: SOLOMOS.lat + 0.1, lng: SOLOMOS.lng })).toBeCloseTo(0, 1);
  });

  it("returns 90 for due east", () => {
    expect(bearingDeg(SOLOMOS, { lat: SOLOMOS.lat, lng: SOLOMOS.lng + 0.1 })).toBeCloseTo(90, 1);
  });

  it("returns 180 for due south", () => {
    expect(bearingDeg(SOLOMOS, { lat: SOLOMOS.lat - 0.1, lng: SOLOMOS.lng })).toBeCloseTo(180, 1);
  });

  it("always normalises into [0, 360)", () => {
    const west = bearingDeg(SOLOMOS, { lat: SOLOMOS.lat, lng: SOLOMOS.lng - 0.1 });
    expect(west).toBeGreaterThanOrEqual(0);
    expect(west).toBeLessThan(360);
    expect(west).toBeCloseTo(270, 1);
  });
});

describe("compassLabel", () => {
  it("maps cardinal degrees to their letters", () => {
    expect(compassLabel(0)).toBe("N");
    expect(compassLabel(90)).toBe("E");
    expect(compassLabel(180)).toBe("S");
    expect(compassLabel(270)).toBe("W");
  });

  it("rounds to the nearest of eight sectors", () => {
    expect(compassLabel(44)).toBe("NE");
    expect(compassLabel(46)).toBe("NE");
  });

  it("wraps past a full turn back to north", () => {
    expect(compassLabel(360)).toBe("N");
  });
});

describe("snapToPolyline", () => {
  const path: LatLng[] = [
    { lat: 35.17, lng: 33.36 },
    { lat: 35.17, lng: 33.37 },
    { lat: 35.18, lng: 33.37 },
  ];

  it("returns null for a degenerate path", () => {
    expect(snapToPolyline(SOLOMOS, [])).toBeNull();
    expect(snapToPolyline(SOLOMOS, [SOLOMOS])).toBeNull();
  });

  it("snaps a point beside the first segment onto that segment", () => {
    const res = snapToPolyline({ lat: 35.1705, lng: 33.365 }, path);
    expect(res).not.toBeNull();
    expect(res!.segIndex).toBe(0);
    expect(res!.tAlong).toBeGreaterThan(0);
    expect(res!.tAlong).toBeLessThan(1);
    // ~55 m north of the segment.
    expect(res!.crossM).toBeGreaterThan(40);
    expect(res!.crossM).toBeLessThan(70);
  });

  it("reports near-zero cross distance for a point already on the line", () => {
    const res = snapToPolyline({ lat: 35.17, lng: 33.365 }, path);
    expect(res!.crossM).toBeLessThan(1);
  });

  it("clamps to the polyline end for a point beyond it", () => {
    const res = snapToPolyline({ lat: 35.2, lng: 33.37 }, path);
    expect(res!.segIndex).toBe(1);
    expect(res!.tAlong).toBe(1);
  });

  it("reports alongM bounded by the polyline length", () => {
    const res = snapToPolyline({ lat: 35.175, lng: 33.37 }, path);
    expect(res!.alongM).toBeGreaterThan(0);
    expect(res!.alongM).toBeLessThanOrEqual(polylineLengthM(path) + 1);
  });
});

describe("polylineLengthM", () => {
  it("is zero for fewer than two points", () => {
    expect(polylineLengthM([])).toBe(0);
    expect(polylineLengthM([SOLOMOS])).toBe(0);
  });

  it("sums the segment distances", () => {
    const mid: LatLng = { lat: 35.0, lng: 33.5 };
    const total = polylineLengthM([SOLOMOS, mid, FINIKOUDES]);
    expect(total).toBeCloseTo(distanceM(SOLOMOS, mid) + distanceM(mid, FINIKOUDES), 6);
  });
});

describe("projectOnSteps", () => {
  const destination: LatLng = { lat: 35.1755, lng: 33.365 };
  const steps: WalkStep[] = [
    {
      instruction: "Head north",
      distanceMeters: 60,
      maneuver: "straight",
      start: { lat: 35.174, lng: 33.365 },
      heading: 0,
    },
    {
      instruction: "Continue north",
      distanceMeters: 60,
      maneuver: "straight",
      start: { lat: 35.1748, lng: 33.365 },
      heading: 0,
    },
  ];

  it("falls back to a straight line when there are no steps", () => {
    const res = projectOnSteps(SOLOMOS, [], destination);
    expect(res.currentIndex).toBe(0);
    expect(res.metersToStepEnd).toBeCloseTo(res.metersToDestination, 6);
    expect(res.walkingEtaSec).toBe(
      Math.round(distanceM(SOLOMOS, destination) / WALK_M_PER_S),
    );
  });

  it("keeps the rider on the first step at the start of the walk", () => {
    const res = projectOnSteps({ lat: 35.174, lng: 33.365 }, steps, destination);
    expect(res.currentIndex).toBe(0);
    expect(res.metersToDestination).toBeGreaterThan(0);
  });

  it("advances to the final step once the first is behind the rider", () => {
    const res = projectOnSteps({ lat: 35.17482, lng: 33.365 }, steps, destination);
    expect(res.currentIndex).toBe(1);
  });

  it("derives the walking ETA from the remaining distance", () => {
    const res = projectOnSteps({ lat: 35.174, lng: 33.365 }, steps, destination);
    expect(res.walkingEtaSec).toBe(Math.round(res.metersToDestination / WALK_M_PER_S));
  });
});
