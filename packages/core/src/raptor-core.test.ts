import { describe, expect, it } from "vitest";
import {
  RAPTOR_TUNING,
  buildSpatialBuckets,
  bucketKey,
  finalise,
  haversineKm,
  lastEnd,
  nearbyStops,
  nearestStops,
  walkMetersOnStreet,
  walkSecFromMeters,
  type StopLike,
} from "./raptor-core";
import type { Leg } from "./itinerary-types";

const NICOSIA = { lat: 35.1667, lng: 33.3667 };

function stop(name: string, lat: number, lng: number): StopLike {
  return { name, lat, lng };
}

describe("distance and walking", () => {
  it("measures a known Cyprus corridor within a kilometre", () => {
    const limassol = { lat: 34.679, lng: 33.0413 };
    const km = haversineKm(NICOSIA, limassol);
    expect(km).toBeGreaterThan(60);
    expect(km).toBeLessThan(70);
  });

  it("returns zero for the same point", () => {
    expect(haversineKm(NICOSIA, NICOSIA)).toBe(0);
  });

  it("applies the detour factor to walking time", () => {
    // 1000 m straight line → 1350 m walked at 1.35 m/s → 1000 s.
    expect(walkSecFromMeters(1000)).toBe(1000);
    expect(walkSecFromMeters(0)).toBe(0);
  });

  it("quotes on-street meters, not straight-line", () => {
    expect(walkMetersOnStreet(400)).toBe(540);
    expect(walkMetersOnStreet(0)).toBe(0);
  });
});

describe("nearestStops", () => {
  const list: Array<[string, StopLike]> = [
    ["a", stop("Very close", 35.167, 33.367)],
    ["b", stop("500m away", 35.1712, 33.3667)],
    ["c", stop("2.5km away", 35.189, 33.3667)],
    ["d", stop("Limassol", 34.679, 33.0413)],
  ];

  it("returns candidates nearest-first inside the radius", () => {
    const out = nearestStops(list, NICOSIA, 2, 8);
    expect(out.map((o) => o.id)).toEqual(["a", "b"]);
    expect(out[0].distKm).toBeLessThan(out[1].distKm);
    expect(out[0].stop.name).toBe("Very close");
  });

  it("caps to topN", () => {
    expect(nearestStops(list, NICOSIA, 5, 1).map((o) => o.id)).toEqual(["a"]);
  });

  it("rejects far-away stops via the bounding box without a haversine", () => {
    expect(nearestStops(list, NICOSIA, 200, 8).some((o) => o.id === "d")).toBe(false);
  });

  it("returns an empty list when nothing is in range", () => {
    expect(nearestStops(list, { lat: 0, lng: 0 }, 1, 8)).toEqual([]);
  });
});

describe("spatial buckets", () => {
  const stops: Record<string, StopLike> = {
    a: stop("A", 35.167, 33.367),
    b: stop("B", 35.1673, 33.3674), // ~50 m from A
    c: stop("C", 35.177, 33.367), // ~1.1 km from A — outside 600 m
  };

  it("keys by the 0.005 degree grid", () => {
    expect(bucketKey(35.167, 33.367)).toBe(bucketKey(35.1671, 33.3671));
    expect(bucketKey(35.167, 33.367)).not.toBe(bucketKey(35.2, 33.367));
  });

  it("groups co-located stops into one bucket", () => {
    const b = buildSpatialBuckets(stops);
    const key = bucketKey(35.167, 33.367);
    expect(b.get(key)).toEqual(["a", "b"]);
  });

  it("finds only walkable neighbours, nearest first", () => {
    const b = buildSpatialBuckets(stops);
    const near = nearbyStops(b, stops, stops.a, RAPTOR_TUNING.maxTransferWalkM);
    expect(near.map((n) => n[0])).toEqual(["a", "b"]);
    expect(near[0][1]).toBe(0);
    expect(near[1][1]).toBeGreaterThan(0);
    expect(near.some((n) => n[0] === "c")).toBe(false);
  });

  it("caps the per-stop fan-out", () => {
    const many: Record<string, StopLike> = {};
    for (let i = 0; i < 20; i++) many[`s${i}`] = stop(`S${i}`, 35.167 + i * 0.00005, 33.367);
    const near = nearbyStops(buildSpatialBuckets(many), many, many.s0, 600);
    expect(near.length).toBe(RAPTOR_TUNING.maxTransferNeighbours);
  });

  it("returns nothing when the grid around the point is empty", () => {
    const b = buildSpatialBuckets(stops);
    expect(nearbyStops(b, stops, { lat: 0, lng: 0 }, 600)).toEqual([]);
  });
});

// ---- itinerary finalisation -------------------------------------------------

const T0 = 1_700_000_000;

function walk(sec: number, meters: number): Leg {
  return {
    kind: "walk",
    from: { name: "A", lat: 35.1, lng: 33.3 },
    to: { name: "B", lat: 35.11, lng: 33.31 },
    durationSec: sec,
    distanceMeters: meters,
    verified: false,
  };
}

function ride(routeId: string, depUnix: number, arrUnix: number): Leg {
  return {
    kind: "ride",
    routeId,
    routeShort: routeId,
    routeLong: "",
    tripId: `${routeId}-trip`,
    live: false,
    board: { stopId: `${routeId}-b`, name: "Board", lat: 35.1, lng: 33.3, departureUnix: depUnix },
    alight: { stopId: `${routeId}-a`, name: "Alight", lat: 35.2, lng: 33.4, arrivalUnix: arrUnix },
    stopCount: 4,
    delaySec: 0,
  };
}

describe("lastEnd", () => {
  it("advances through walks and waits", () => {
    expect(
      lastEnd(
        [
          walk(300, 400),
          { kind: "wait", stopId: "s", name: "S", lat: 0, lng: 0, durationSec: 120 },
        ],
        T0,
      ),
    ).toBe(T0 + 420);
  });

  it("jumps to the ride's alight time", () => {
    expect(lastEnd([walk(300, 400), ride("30", T0 + 600, T0 + 1800)], T0)).toBe(T0 + 1800);
  });

  it("returns the departure time for an empty plan", () => {
    expect(lastEnd([], T0)).toBe(T0);
  });
});

describe("finalise", () => {
  it("scores a single-ride itinerary with no penalties under 500 m of walking", () => {
    const legs = [walk(200, 250), ride("30", T0 + 300, T0 + 1500), walk(120, 150)];
    const it = finalise(legs, T0);
    expect(it.transfers).toBe(0);
    expect(it.totalWalkMeters).toBe(400);
    expect(it.arrivalUnix).toBe(T0 + 1500 + 120);
    expect(it.totalDurationSec).toBe(it.arrivalUnix - T0);
    expect(it.score).toBe(it.totalDurationSec);
    expect(it.source).toBe("estimated");
  });

  it("penalises transfers and long walks so a slog never outranks a simple ride", () => {
    const simple = finalise([walk(200, 250), ride("30", T0 + 300, T0 + 2000)], T0);
    const slog = finalise(
      [
        walk(600, 800),
        ride("30", T0 + 700, T0 + 1200),
        walk(300, 400),
        ride("40", T0 + 1600, T0 + 1900),
      ],
      T0,
    );
    expect(slog.transfers).toBe(1);
    expect(slog.arrivalUnix).toBeLessThan(simple.arrivalUnix);
    expect(slog.score).toBeGreaterThan(simple.score);
  });

  it("builds a stable id from the ride signature", () => {
    const a = finalise([ride("30", T0, T0 + 100)], T0);
    const b = finalise([ride("30", T0, T0 + 100)], T0);
    expect(a.id).toBe(b.id);
    expect(a.id).toContain("30-30-b-30-a");
  });
});
