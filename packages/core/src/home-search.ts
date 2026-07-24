// Pure search ranking for the home screen's omni-search. No DOM, no network:
// callers hand in the static GTFS slices plus the live vehicle list, and get
// back an ordered, deduped result list ready to render.
import { distanceM, type LatLng } from "./geo";

export type SearchRouteInput = { id: string; short: string; long: string; agency: string };
export type SearchStopInput = { id: string; name: string; agency: string };
export type SearchAirportInput = {
  code: string;
  iata: string;
  name: string;
  nameEl: string;
  city: string;
  cityEl: string;
};
export type SearchVehicleInput = {
  id: string;
  tripId: string;
  routeId: string;
  label: string;
  lat: number;
  lng: number;
};

export type SearchResult =
  | { kind: "stop"; id: string; name: string; sub: string; routes: string[] }
  | { kind: "route"; id: string; code: string; name: string; city: string; liveCount: number }
  | {
      kind: "vehicle";
      id: string;
      tripId: string;
      routeId: string;
      routeCode: string;
      label: string;
      sub: string;
    }
  | { kind: "airport"; id: string; iata: string; name: string; city: string };

export const AGENCY_CITY: Record<string, string> = {
  NPT: "Nicosia",
  LMS: "Limassol",
  PFO: "Paphos",
  LCA: "Larnaca",
  FAM: "Famagusta",
  IC: "Intercity",
  SPC: "Pame Express",
};

export const AGENCY_RANK: Record<string, number> = {
  NPT: 0,
  LMS: 1,
  LCA: 2,
  PFO: 3,
  FAM: 4,
  IC: 5,
  SPC: 6,
};

export type SearchInputs = {
  routes: SearchRouteInput[];
  stops: SearchStopInput[];
  airports: SearchAirportInput[];
  vehicles: SearchVehicleInput[];
  origin: LatLng;
  /** Copy for a stop's secondary line, so the caller controls localisation. */
  labels?: { intercity?: string; urban?: string; kmAway?: (km: number) => string };
};

const MAX_RESULTS = 18;

export function searchAll(raw: string, input: SearchInputs): SearchResult[] {
  const q = raw.trim().toLowerCase();
  if (q.length < 1) return [];

  const intercity = input.labels?.intercity ?? "Intercity";
  const urban = input.labels?.urban ?? "Urban";
  const kmAway = input.labels?.kmAway ?? ((km: number) => `${km.toFixed(1)} km away`);

  const out: SearchResult[] = [];

  // Airports — IATA code, city, "airport", or full name in either language.
  for (const a of input.airports) {
    const hay =
      `${a.iata} ${a.name} ${a.nameEl} ${a.city} ${a.cityEl} airport αεροδρόμιο`.toLowerCase();
    if (a.iata.toLowerCase() === q || a.city.toLowerCase().startsWith(q) || hay.includes(q)) {
      out.push({ kind: "airport", id: a.code, iata: a.iata, name: a.name, city: a.city });
    }
  }

  // Routes — exact short matches first, then prefix, then long-name hits;
  // ties broken by agency so the rider's own city floats up.
  const matchedRoutes = input.routes
    .filter(
      (r) =>
        r.short.toLowerCase() === q ||
        r.short.toLowerCase().startsWith(q) ||
        r.long.toLowerCase().includes(q),
    )
    .map((r) => ({
      r,
      exact: r.short.toLowerCase() === q ? 0 : r.short.toLowerCase().startsWith(q) ? 1 : 2,
      rank: AGENCY_RANK[r.agency] ?? 9,
    }))
    .sort((a, b) => a.exact - b.exact || a.rank - b.rank)
    .slice(0, 8)
    .map((x) => x.r);

  const routeById = new Map(input.routes.map((r) => [r.id, r]));

  for (const r of matchedRoutes) {
    out.push({
      kind: "route",
      id: r.id,
      code: r.short,
      name: r.long,
      city: AGENCY_CITY[r.agency] ?? r.agency,
      liveCount: input.vehicles.filter((v) => v.routeId === r.id).length,
    });
  }

  // Vehicles by fleet label, line number, or raw id.
  for (const v of input.vehicles
    .filter((v) => {
      const r = routeById.get(v.routeId);
      return (
        v.label?.toLowerCase().includes(q) ||
        r?.short.toLowerCase().startsWith(q) ||
        v.id.toLowerCase().includes(q)
      );
    })
    .slice(0, 4)) {
    const r = routeById.get(v.routeId);
    out.push({
      kind: "vehicle",
      id: v.id,
      tripId: v.tripId,
      routeId: v.routeId,
      routeCode: r?.short ?? "—",
      label: v.label || `Bus ${v.id}`,
      sub: kmAway(distanceM({ lat: v.lat, lng: v.lng }, input.origin) / 1000),
    });
  }

  // Stops last — they are the broadest match and the least specific intent.
  for (const s of input.stops.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6)) {
    out.push({
      kind: "stop",
      id: s.id,
      name: s.name,
      sub: s.agency === "IC" ? intercity : urban,
      routes: [],
    });
  }

  return out.slice(0, MAX_RESULTS);
}
