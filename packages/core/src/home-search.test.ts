import { describe, expect, it } from "vitest";
import { searchAll, type SearchInputs } from "./home-search";

const base: SearchInputs = {
  routes: [
    { id: "r1", short: "1", long: "Nicosia Central Loop", agency: "NPT" },
    { id: "r10", short: "10", long: "Limassol Seafront", agency: "LMS" },
    { id: "r100", short: "100", long: "Intercity Nicosia — Limassol", agency: "IC" },
  ],
  stops: [
    { id: "s1", name: "Solomou Square", agency: "NPT" },
    { id: "s2", name: "Limassol Port", agency: "IC" },
  ],
  airports: [
    {
      code: "lca",
      iata: "LCA",
      name: "Larnaca International",
      nameEl: "Λάρνακα",
      city: "Larnaca",
      cityEl: "Λάρνακα",
    },
  ],
  vehicles: [
    { id: "v1", tripId: "t1", routeId: "r1", label: "1042", lat: 35.17, lng: 33.36 },
    { id: "v2", tripId: "t2", routeId: "r1", label: "1043", lat: 35.18, lng: 33.36 },
  ],
  origin: { lat: 35.17, lng: 33.36 },
};

describe("searchAll", () => {
  it("returns nothing for an empty query", () => {
    expect(searchAll("   ", base)).toEqual([]);
  });

  it("ranks the exact line match above prefix matches", () => {
    const routes = searchAll("1", base).filter((r) => r.kind === "route");
    expect(routes[0]).toMatchObject({ kind: "route", code: "1" });
    expect(routes.map((r) => r.kind === "route" && r.code)).toEqual(["1", "10", "100"]);
  });

  it("counts live vehicles per matched route", () => {
    const r = searchAll("1", base).find((x) => x.kind === "route" && x.code === "1");
    expect(r).toMatchObject({ liveCount: 2 });
  });

  it("matches airports by IATA, city and the word airport", () => {
    for (const q of ["lca", "larn", "airport", "αεροδρόμιο"]) {
      expect(searchAll(q, base).some((r) => r.kind === "airport")).toBe(true);
    }
  });

  it("labels intercity stops distinctly and honours custom copy", () => {
    const res = searchAll("limassol port", { ...base, labels: { intercity: "Υπεραστικό" } });
    expect(res.find((r) => r.kind === "stop")).toMatchObject({ sub: "Υπεραστικό" });
  });

  it("reports vehicle distance from the rider", () => {
    const v = searchAll("1043", base).find((r) => r.kind === "vehicle");
    expect(v && v.kind === "vehicle" && v.sub).toMatch(/^1\.1 km away$/);
  });

  it("caps the result list", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `x${i}`,
      name: `Stop alpha ${i}`,
      agency: "NPT",
    }));
    expect(searchAll("alpha", { ...base, stops: many }).length).toBeLessThanOrEqual(18);
  });
});
