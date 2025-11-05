// Client-side helpers for the bundled Cyprus GTFS static data.
import stopsData from "@/data/stops.json";
import routesData from "@/data/routes.json";

export type StaticStop = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  agency: string;
};
export type StaticRoute = {
  id: string;
  short: string;
  long: string;
  color: string;
  agency: string;
};

export const STOPS: StaticStop[] = stopsData as StaticStop[];
export const ROUTES: StaticRoute[] = routesData as StaticRoute[];

const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));
const STOP_BY_ID = new Map(STOPS.map((s) => [s.id, s]));

export const getRoute = (id: string) => ROUTE_BY_ID.get(id);
export const getStop = (id: string) => STOP_BY_ID.get(id);

// Haversine, km
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function nearestStops(
  from: { lat: number; lng: number },
  limit = 6,
) {
  return STOPS.map((s) => ({ ...s, distanceKm: distanceKm(from, s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

// Friendly tone cycling for route chips based on route color hue or fallback.
export function routeTone(routeId: string | undefined): "aegean" | "ochre" | "olive" {
  if (!routeId) return "aegean";
  const r = ROUTE_BY_ID.get(routeId);
  if (!r) return "aegean";
  const c = (r.color || "").toUpperCase();
  // Quick heuristic from GTFS hex
  if (/^(F|E|C|D)[0-9A-F]/.test(c) && /[A-F89]{2}$/.test(c.slice(-2))) return "ochre";
  if (/^(0|1|2|3)[0-9A-F]/.test(c) && /[0-5]/.test(c[2])) return "aegean";
  return "olive";
}

// Pretty city / area name for the stop list
export const NICOSIA_CENTER = { lat: 35.1740, lng: 33.3650 };

// Heuristic stop classification — GTFS bundle has no location_type, so we
// derive a visual archetype from agency + name patterns. Used to pick a
// painted vignette per stop card.
export type StopKind = "shelter" | "pole" | "terminal";
const TERMINAL_RE = /\b(station|terminal|interchange|airport|port|depot)\b/i;
export function stopKind(stop: { name: string; agency: string }): StopKind {
  if (TERMINAL_RE.test(stop.name)) return "terminal";
  if (stop.agency === "IC") return "pole";
  return "shelter";
}
