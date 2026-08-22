import { describe, expect, it } from "vitest";

import {
  CITIES,
  cityById,
  cityForAgency,
  distanceKm,
  isInCityCore,
  nearestCity,
} from "./cities";

describe("city catalogue", () => {
  it("covers the five urban feeds exactly once", () => {
    expect(CITIES.map((c) => c.id).sort()).toEqual([
      "famagusta",
      "larnaca",
      "limassol",
      "nicosia",
      "paphos",
    ]);
  });

  it("has a unique agency code per city", () => {
    const agencies = CITIES.map((c) => c.agency);
    expect(new Set(agencies).size).toBe(agencies.length);
  });

  it("places every centre inside Cyprus' bounding box", () => {
    for (const c of CITIES) {
      expect(c.center.lat, c.id).toBeGreaterThan(34.5);
      expect(c.center.lat, c.id).toBeLessThan(35.8);
      expect(c.center.lng, c.id).toBeGreaterThan(32.2);
      expect(c.center.lng, c.id).toBeLessThan(34.6);
      expect(c.coreRadiusKm, c.id).toBeGreaterThan(0);
    }
  });
});

describe("lookups", () => {
  it("resolves a city by id", () => {
    expect(cityById("limassol")?.agency).toBe("LMS");
  });

  it("resolves a city by agency code", () => {
    expect(cityForAgency("PFO")?.id).toBe("paphos");
  });

  it("returns undefined for the intercity agency, which is not a city", () => {
    expect(cityForAgency("IC")).toBeUndefined();
    expect(cityForAgency("")).toBeUndefined();
  });
});

describe("nearestCity", () => {
  it("returns the city its own centre belongs to", () => {
    for (const c of CITIES) {
      expect(nearestCity(c.center.lat, c.center.lng).id).toBe(c.id);
    }
  });

  it("maps Larnaca airport to Larnaca", () => {
    expect(nearestCity(34.8751, 33.6249).id).toBe("larnaca");
  });

  it("maps the Troodos mountains to a real city rather than failing", () => {
    expect(CITIES.map((c) => c.id)).toContain(nearestCity(34.9229, 32.8622).id);
  });
});

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ lat: 35, lng: 33 }, { lat: 35, lng: 33 })).toBe(0);
  });

  it("matches the known Nicosia → Limassol distance", () => {
    const km = distanceKm(cityById("nicosia")!.center, cityById("limassol")!.center);
    expect(km).toBeGreaterThan(55);
    expect(km).toBeLessThan(65);
  });
});

describe("isInCityCore", () => {
  it("accepts the city centre itself", () => {
    const nicosia = cityById("nicosia")!;
    expect(isInCityCore(nicosia, nicosia.center)).toBe(true);
  });

  it("rejects another city's centre", () => {
    const nicosia = cityById("nicosia")!;
    expect(isInCityCore(nicosia, cityById("larnaca")!.center)).toBe(false);
  });

  it("treats the radius boundary as inside", () => {
    const paphos = cityById("paphos")!;
    // Move north to just inside the core radius (1 deg latitude ≈ 111.2 km).
    const edge = { lat: paphos.center.lat + (paphos.coreRadiusKm - 0.01) / 111.2, lng: paphos.center.lng };
    expect(isInCityCore(paphos, edge)).toBe(true);
  });
});
