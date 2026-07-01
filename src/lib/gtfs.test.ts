import { describe, expect, it } from "vitest";

import { distanceKm, getRoute, getStop, nearestStops, ROUTES, routeTone, STOPS, stopKind } from "./gtfs";

describe("bundled static feed", () => {
  it("ships stops and routes", () => {
    expect(STOPS.length).toBeGreaterThan(100);
    expect(ROUTES.length).toBeGreaterThan(10);
  });

  it("has well-formed coordinates on every stop", () => {
    for (const s of STOPS) {
      expect(Number.isFinite(s.lat), s.id).toBe(true);
      expect(Number.isFinite(s.lng), s.id).toBe(true);
      expect(s.agency.length, s.id).toBeGreaterThan(0);
    }
  });
});

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ lat: 35.174, lng: 33.365 }, { lat: 35.174, lng: 33.365 })).toBe(0);
  });

  it("matches the known Nicosia → Larnaca distance", () => {
    const km = distanceKm({ lat: 35.174, lng: 33.365 }, { lat: 34.9183, lng: 33.6354 });
    expect(km).toBeGreaterThan(38);
    expect(km).toBeLessThan(39.5);
  });
});

describe("getStop", () => {
  it("resolves a bundled stop by its local id", () => {
    const sample = STOPS[0];
    expect(getStop(sample.id)).toBeDefined();
  });

  it("prefers the agency-scoped match when ids collide across feeds", () => {
    const byAgency = new Map<string, string[]>();
    for (const s of STOPS) {
      byAgency.set(s.id, [...(byAgency.get(s.id) ?? []), s.agency]);
    }
    const collision = [...byAgency.entries()].find(([, a]) => new Set(a).size > 1);
    if (!collision) return; // no colliding ids in this bundle
    const [id, agencies] = collision;
    for (const agency of new Set(agencies)) {
      expect(getStop(id, agency)?.agency).toBe(agency);
    }
  });

  it("falls back to the first match for an unknown agency", () => {
    const sample = STOPS[0];
    expect(getStop(sample.id, "NOPE")).toBeDefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(getStop("no-such-stop")).toBeUndefined();
  });
});

describe("getRoute", () => {
  it("resolves a bundled route", () => {
    expect(getRoute(ROUTES[0].id)?.id).toBe(ROUTES[0].id);
  });

  it("returns undefined for an unknown route", () => {
    expect(getRoute("no-such-route")).toBeUndefined();
  });
});

describe("nearestStops", () => {
  const NICOSIA = { lat: 35.174, lng: 33.365 };

  it("returns results ordered by distance", () => {
    const near = nearestStops(NICOSIA, 10);
    const distances = near.map((s) => s.distanceKm);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("honours the limit", () => {
    expect(nearestStops(NICOSIA, 3)).toHaveLength(3);
  });

  it("puts a Nicosia stop first for a Nicosia rider", () => {
    expect(nearestStops(NICOSIA, 1)[0].distanceKm).toBeLessThan(2);
  });
});

describe("routeTone", () => {
  it("defaults to aegean without a route", () => {
    expect(routeTone(undefined)).toBe("aegean");
    expect(routeTone("no-such-route")).toBe("aegean");
  });

  it("only ever returns a palette tone", () => {
    for (const r of ROUTES.slice(0, 50)) {
      expect(["aegean", "ochre", "olive"]).toContain(routeTone(r.id));
    }
  });
});

describe("stopKind", () => {
  it("classifies named interchanges as terminals", () => {
    expect(stopKind({ name: "Larnaca Airport", agency: "IC" })).toBe("terminal");
    expect(stopKind({ name: "Solomos Square", agency: "NPT" })).toBe("terminal");
    expect(stopKind({ name: "Central Station", agency: "NPT" })).toBe("terminal");
  });

  it("classifies plain intercity stops as poles", () => {
    expect(stopKind({ name: "Kophinou junction", agency: "IC" })).toBe("pole");
  });

  it("classifies plain urban stops as shelters", () => {
    expect(stopKind({ name: "Makariou 12", agency: "NPT" })).toBe("shelter");
  });

  it("matches terminal keywords case-insensitively", () => {
    expect(stopKind({ name: "NICOSIA PORT", agency: "NPT" })).toBe("terminal");
  });
});
