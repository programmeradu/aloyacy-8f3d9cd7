// Shape index: polyline decoding, the trip -> shape lookup and the lazy
// fetch/caching behaviour. The module keeps its index in module scope, so
// every test re-imports it through `vi.resetModules()` to get a clean cache.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import polyline from "@mapbox/polyline";

type ShapesModule = typeof import("./shapes");

const LINE = [
  [35.17, 33.36],
  [35.18, 33.37],
  [35.19, 33.38],
] as [number, number][];

const ENCODED = polyline.encode(LINE);

const INDEX = {
  "NPT-1": {
    shapes: { "shape-a": ENCODED, "shape-b": polyline.encode(LINE.slice(0, 2)) },
    trips: { "trip-1": "shape-a", "trip-2": "shape-b", "trip-missing": "shape-gone" },
  },
  "NPT-2": {
    shapes: { "shape-c": ENCODED },
    trips: { "trip-3": "shape-c" },
  },
};

async function load(
  fetchImpl: typeof fetch = vi.fn(async () => new Response(JSON.stringify(INDEX), { status: 200 })),
): Promise<{ mod: ShapesModule; fetchImpl: typeof fetch }> {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchImpl);
  const mod = (await import("./shapes")) as ShapesModule;
  return { mod, fetchImpl };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodePolyline", () => {
  it("returns an empty array for empty input", async () => {
    const { mod } = await load();
    expect(mod.decodePolyline("")).toEqual([]);
  });

  it("round-trips an encoded polyline to lat/lng pairs", async () => {
    const { mod } = await load();
    const points = mod.decodePolyline(ENCODED);
    expect(points).toHaveLength(3);
    expect(points[0].lat).toBeCloseTo(35.17, 5);
    expect(points[0].lng).toBeCloseTo(33.36, 5);
    expect(points[2].lat).toBeCloseTo(35.19, 5);
  });
});

describe("sync lookups before the index loads", () => {
  it("returns null rather than blocking the render", async () => {
    const { mod } = await load();
    expect(mod.getShapeForTripSync("trip-1", "NPT-1")).toBeNull();
    expect(mod.getAnyShapeForRouteSync("NPT-1")).toBeNull();
  });
});

describe("getShapeForTrip", () => {
  it("loads the index once and resolves the trip's shape", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(INDEX), { status: 200 }),
    ) as unknown as typeof fetch;
    const { mod } = await load(fetchImpl);

    const [a, b] = await Promise.all([
      mod.getShapeForTrip("trip-1", "NPT-1"),
      mod.getShapeForTrip("trip-3", "NPT-2"),
    ]);

    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    // Concurrent callers share one in-flight request.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to scanning every route when no routeId is given", async () => {
    const { mod } = await load();
    const pts = await mod.getShapeForTrip("trip-3");
    expect(pts?.length).toBe(3);
  });

  it("falls back to scanning when the given routeId is wrong", async () => {
    const { mod } = await load();
    expect(await mod.getShapeForTrip("trip-3", "NPT-1")).toHaveLength(3);
  });

  it("returns null for an unknown trip", async () => {
    const { mod } = await load();
    expect(await mod.getShapeForTrip("nope", "NPT-1")).toBeNull();
  });

  it("returns null when the shape is too short to draw", async () => {
    const { mod } = await load();
    // trip-missing points at a shapeId with no encoded polyline.
    expect(await mod.getShapeForTrip("trip-missing", "NPT-1")).toBeNull();
  });

  it("caches decoded points across repeated lookups", async () => {
    const { mod } = await load();
    const first = await mod.getShapeForTrip("trip-1", "NPT-1");
    const second = mod.getShapeForTripSync("trip-1", "NPT-1");
    expect(second).toBe(first);
  });
});

describe("getAnyShapeForRouteSync", () => {
  it("returns the first variant once loaded", async () => {
    const { mod } = await load();
    await mod.getShapeForTrip("trip-1", "NPT-1");
    const pts = mod.getAnyShapeForRouteSync("NPT-1");
    expect(pts).toHaveLength(3);
    // Second call reads the decode cache.
    expect(mod.getAnyShapeForRouteSync("NPT-1")).toBe(pts);
  });

  it("returns null for an unknown route", async () => {
    const { mod } = await load();
    await mod.getShapeForTrip("trip-1", "NPT-1");
    expect(mod.getAnyShapeForRouteSync("NOPE")).toBeNull();
  });

  it("returns null for a route with no shapes", async () => {
    const empty = { "NPT-9": { shapes: {}, trips: {} } };
    const { mod } = await load(
      vi.fn(async () => new Response(JSON.stringify(empty), { status: 200 })) as unknown as typeof fetch,
    );
    await mod.getShapeForTrip("whatever");
    expect(mod.getAnyShapeForRouteSync("NPT-9")).toBeNull();
  });
});

describe("index loading failures", () => {
  it("treats a non-OK response as an empty index instead of throwing", async () => {
    const { mod } = await load(
      vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
    );
    expect(await mod.getShapeForTrip("trip-1", "NPT-1")).toBeNull();
  });

  it("swallows network errors — a missing map line must never break a trip", async () => {
    const { mod } = await load(
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    );
    expect(await mod.getShapeForTrip("trip-1", "NPT-1")).toBeNull();
  });
});

describe("prefetchShapes", () => {
  it("warms the index in the background so the first map paint is instant", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(INDEX), { status: 200 }),
    ) as unknown as typeof fetch;
    const { mod } = await load(fetchImpl);
    mod.prefetchShapes();
    mod.prefetchShapes();
    await mod.getShapeForTrip("trip-1", "NPT-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
