import { describe, expect, it } from "vitest";
import {
  areaFromStop,
  groupArrivalsByStop,
  nearestStops,
  onTimePercent,
  routeChipsForStop,
  searchResultBadge,
  searchResultCopy,
  searchResultHref,
  toneForRoute,
  CY_AIRPORTS,
  type BoardArrival,
} from "./home-board";

const HERE = { lat: 35.17, lng: 33.36 };

describe("toneForRoute", () => {
  it("is deterministic for the same id", () => {
    expect(toneForRoute("NPT:157")).toBe(toneForRoute("NPT:157"));
  });

  it("only ever returns known tones", () => {
    const tones = new Set(["aegean", "ochre", "olive"]);
    for (const id of ["a", "b", "c", "157", "IC:X", ""]) {
      expect(tones.has(toneForRoute(id))).toBe(true);
    }
  });
});

describe("areaFromStop", () => {
  it("takes the segment before a separator", () => {
    expect(areaFromStop({ name: "Makariou Ave · Nicosia" })).toBe("Makariou Ave");
    expect(areaFromStop({ name: "Finikoudes, Larnaca" })).toBe("Finikoudes");
    expect(areaFromStop({ name: "Agios Dometios - Terminal" })).toBe("Agios Dometios");
  });

  it("falls back for missing or blank names", () => {
    expect(areaFromStop(null)).toBe("Cyprus");
    expect(areaFromStop({ name: "   " })).toBe("Cyprus");
    expect(areaFromStop({ name: "· leading" }, "Island")).toBe("Island");
  });
});

describe("nearestStops", () => {
  const stops = [
    { id: "far", lat: 35.3, lng: 33.5 },
    { id: "near", lat: 35.171, lng: 33.361 },
    { id: "mid", lat: 35.2, lng: 33.4 },
  ];

  it("sorts by distance and annotates metres", () => {
    const out = nearestStops(HERE, stops, 3);
    expect(out.map((s) => s.id)).toEqual(["near", "mid", "far"]);
    expect(out[0]!.d).toBeLessThan(300);
  });

  it("respects the limit", () => {
    expect(nearestStops(HERE, stops, 1)).toHaveLength(1);
    expect(nearestStops(HERE, stops, 0)).toHaveLength(0);
  });
});

describe("groupArrivalsByStop", () => {
  const now = 1_000_000;
  const arrivals: BoardArrival[] = [
    { stopId: "s1", routeId: "r2", tripId: "t2", arrivalUnix: now + 600, delaySec: 0 },
    { stopId: "s1", routeId: "r1", tripId: "t1", arrivalUnix: now + 120, delaySec: 0 },
    { stopId: "s2", routeId: "r3", tripId: "t3", arrivalUnix: now + 60, delaySec: 0 },
    { stopId: "s1", routeId: "r9", tripId: "t9", arrivalUnix: now + 9_000, delaySec: 0 },
  ];

  it("buckets by stop, sorted soonest first", () => {
    const g = groupArrivalsByStop(arrivals, now);
    expect(g.get("s1")!.map((a) => a.tripId)).toEqual(["t1", "t2"]);
    expect(g.get("s2")![0]!.etaMin).toBe(1);
  });

  it("drops arrivals past the horizon", () => {
    expect(
      groupArrivalsByStop(arrivals, now)
        .get("s1")!
        .some((a) => a.tripId === "t9"),
    ).toBe(false);
    expect(groupArrivalsByStop(arrivals, now, 240).get("s1")).toHaveLength(3);
  });

  it("clamps arrivals already in the past to zero", () => {
    const g = groupArrivalsByStop(
      [{ stopId: "s", routeId: "r", tripId: "t", arrivalUnix: now - 500, delaySec: 0 }],
      now,
    );
    expect(g.get("s")![0]!.etaMin).toBe(0);
  });
});

describe("routeChipsForStop", () => {
  const routes = { r1: { short: "157", color: "#0af" }, r2: { short: "259" } };
  const headsign = (t: string) => (t === "t1" ? "Solomou" : null);

  it("dedupes routes and keeps arrival order", () => {
    const chips = routeChipsForStop(
      [
        { routeId: "r1", tripId: "t1", etaMin: 2 },
        { routeId: "r1", tripId: "t4", etaMin: 8 },
        { routeId: "r2", tripId: "t2", etaMin: 9 },
      ],
      routes,
      headsign,
    );
    expect(chips.map((c) => c.code)).toEqual(["157", "259"]);
    expect(chips[0]!.headsign).toBe("Solomou");
    expect(chips[0]!.color).toBe("#0af");
  });

  it("honours the limit", () => {
    const chips = routeChipsForStop(
      [
        { routeId: "r1", tripId: "t1", etaMin: 1 },
        { routeId: "r2", tripId: "t2", etaMin: 2 },
      ],
      routes,
      headsign,
      1,
    );
    expect(chips).toHaveLength(1);
  });

  it("falls back to a placeholder chip when nothing is predicted", () => {
    const chips = routeChipsForStop([], routes, headsign);
    expect(chips).toEqual([{ code: "—", tone: "olive", headsign: null }]);
  });

  it("uses the route id when metadata is missing", () => {
    const chips = routeChipsForStop([{ routeId: "zz", tripId: "t", etaMin: 3 }], routes, headsign);
    expect(chips[0]!.code).toBe("zz");
  });
});

describe("onTimePercent", () => {
  it("counts arrivals inside the tolerance", () => {
    expect(
      onTimePercent([{ delaySec: 0 }, { delaySec: 130 }, { delaySec: -60 }, { delaySec: 5 }]),
    ).toBe(75);
  });

  it("returns null with no sample", () => {
    expect(onTimePercent([])).toBeNull();
  });

  it("caps the sample size", () => {
    const arr = Array.from({ length: 500 }, (_, i) => ({ delaySec: i < 400 ? 0 : 900 }));
    expect(onTimePercent(arr)).toBe(100);
  });
});

describe("search result presentation", () => {
  it("routes each hit kind to its screen", () => {
    expect(searchResultHref({ kind: "stop", id: "s1", name: "A", sub: "Urban", routes: [] })).toBe(
      "/stop/s1",
    );
    expect(
      searchResultHref({
        kind: "route",
        id: "r1",
        code: "157",
        name: "L",
        city: "Nicosia",
        liveCount: 0,
      }),
    ).toBe("/route/r1");
    expect(
      searchResultHref({
        kind: "vehicle",
        id: "v1",
        tripId: "t9",
        routeId: "r1",
        routeCode: "157",
        label: "Bus",
        sub: "1.2 km away",
      }),
    ).toBe("/trip/t9");
    expect(
      searchResultHref({ kind: "airport", id: "lca", iata: "LCA", name: "L", city: "Larnaca" }),
    ).toBe("/airport/lca");
    expect(
      searchResultHref({
        kind: "page",
        id: "green-line",
        title: "The Green Line",
        sub: "named",
        path: "/green-line",
      }),
    ).toBe("/green-line");
  });

  it("badges each hit kind", () => {
    expect(searchResultBadge({ kind: "stop", id: "s", name: "A", sub: "", routes: [] })).toBe(
      "STOP",
    );
    expect(
      searchResultBadge({ kind: "airport", id: "lca", iata: "LCA", name: "L", city: "C" }),
    ).toBe("AIRPORT");
    expect(
      searchResultBadge({
        kind: "page",
        id: "green-line",
        title: "The Green Line",
        sub: "named",
        path: "/green-line",
      }),
    ).toBe("CROSSING");
  });

  it("writes copy without decorative bullets", () => {
    const copy = searchResultCopy({
      kind: "route",
      id: "r1",
      code: "157",
      name: "Long",
      city: "Nicosia",
      liveCount: 3,
    });
    expect(copy.primary).toBe("Route 157");
    expect(copy.meta).toContain("3 live");
    expect(copy.meta).not.toContain("·");
  });

  it("omits the live count when nothing is running", () => {
    expect(
      searchResultCopy({
        kind: "route",
        id: "r",
        code: "1",
        name: "n",
        city: "Paphos",
        liveCount: 0,
      }).meta,
    ).toBe("Paphos");
  });
});

describe("CY_AIRPORTS", () => {
  it("covers both international airports with Greek names", () => {
    expect(CY_AIRPORTS.map((a) => a.iata)).toEqual(["LCA", "PFO"]);
    expect(CY_AIRPORTS.every((a) => a.nameEl.length > 0)).toBe(true);
  });
});
