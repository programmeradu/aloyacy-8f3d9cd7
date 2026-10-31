// Airport endpoints for the planner.
//
// A rider who searches "Larnaca Airport" drops a pin somewhere on a 3 km
// site: the runway, the car park, the old terminal on Artemidos Avenue. The
// planner used to treat that pin like any address and happily ended a journey
// at the nearest bus stop on the airport's edge, 1.3 km of walking short of
// the terminal. An airport trip ends at the terminal, so the endpoint snaps to
// the terminal bus stop and only stops at the terminal forecourt count.
//
// Pure and client-safe: used by the browser timetable planner and the Worker.

export type AirportCode = "LCA" | "PFO";

export type Airport = {
  code: AirportCode;
  name: string;
  /** Terminal forecourt bus stop (timetable stop id and position). */
  stopId: string;
  lat: number;
  lng: number;
};

export const AIRPORTS: readonly Airport[] = [
  { code: "LCA", name: "Larnaca Airport", stopId: "10:6117", lat: 34.8710853159789, lng: 33.6068484902993 },
  { code: "PFO", name: "Paphos Airport", stopId: "2:1813", lat: 34.7114810421567, lng: 32.4889879499105 },
];

/** A point this close to the terminal stop is "the airport". */
export const AIRPORT_SNAP_KM = 2.6;
/** Stops this close to the terminal stop serve the terminal. */
export const AIRPORT_TERMINAL_RADIUS_KM = 0.35;

const AIRPORT_LABEL_RE = /(airport|aerodrom|αεροδρ|\bLCA\b|\bPFO\b)/i;

export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The airport a point means, if any. A point within `AIRPORT_SNAP_KM` of the
 * terminal counts; so does a point a little further out whose label says
 * "airport" (pins dropped on the far side of the runway).
 */
export function airportFor(p: { lat: number; lng: number; label?: string }): Airport | null {
  let best: Airport | null = null;
  let bestKm = Infinity;
  for (const a of AIRPORTS) {
    const d = kmBetween(p, a);
    if (d < bestKm) {
      bestKm = d;
      best = a;
    }
  }
  if (!best) return null;
  if (bestKm <= AIRPORT_SNAP_KM) return best;
  if (bestKm <= 5 && AIRPORT_LABEL_RE.test(p.label ?? "")) return best;
  return null;
}

/** The point moved onto the terminal stop when it is an airport, else as-is. */
export function snapToAirport<P extends { lat: number; lng: number; label?: string }>(
  p: P,
): { point: P; airport: Airport | null } {
  const a = airportFor(p);
  if (!a) return { point: p, airport: null };
  return { point: { ...p, lat: a.lat, lng: a.lng, label: p.label || a.name }, airport: a };
}
