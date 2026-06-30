// Wave 2.5 — Multi-city core. One source of truth for "where is the rider?"
// Used by:
//   - place autocomplete (bias toward the rider's actual city, not Nicosia)
//   - Park & Ride suggester (per-city hubs + per-city geometry gates)
//   - any future surface that needs to localise tone or default region
//
// Cyprus' GTFS feeds use these agency codes:
//   NPT = Nicosia (Lefkosia), LMS = Limassol, LCA = Larnaca,
//   PFO = Paphos, FAM = Famagusta, IC = Intercity, SPC = special.
// We map an agency to its primary city for UI affordances, and we map a
// rider lat/lng to its nearest city via great-circle.

export type CityId = "nicosia" | "limassol" | "larnaca" | "paphos" | "famagusta";

export type CitySpec = {
  id: CityId;
  /** Display name in EN. EL copy is resolved via i18n at render time. */
  label: string;
  /** Agency code used in routes/stops JSON. */
  agency: "NPT" | "LMS" | "LCA" | "PFO" | "FAM";
  /** Geometric centre used as bias for autocomplete and "is this trip
   *  intra-urban?" gates. Tuned to the city's busiest square. */
  center: { lat: number; lng: number };
  /** Radius in km from `center` that we treat as the urban core. Used as
   *  the "destination is downtown" gate for Park & Ride suggestions and
   *  the "origin is outside the core" gate for the same. */
  coreRadiusKm: number;
};

export const CITIES: CitySpec[] = [
  {
    id: "nicosia",
    label: "Nicosia",
    agency: "NPT",
    center: { lat: 35.1740, lng: 33.3650 }, // Solomos Square area
    coreRadiusKm: 5,
  },
  {
    id: "limassol",
    label: "Limassol",
    agency: "LMS",
    center: { lat: 34.6786, lng: 33.0438 }, // Anexartisias / Old Port area
    coreRadiusKm: 5,
  },
  {
    id: "larnaca",
    label: "Larnaca",
    agency: "LCA",
    center: { lat: 34.9183, lng: 33.6354 }, // Finikoudes
    coreRadiusKm: 4,
  },
  {
    id: "paphos",
    label: "Paphos",
    agency: "PFO",
    center: { lat: 34.7720, lng: 32.4297 }, // Kennedy Square
    coreRadiusKm: 4,
  },
  {
    id: "famagusta",
    label: "Famagusta",
    agency: "FAM",
    center: { lat: 35.0150, lng: 33.9000 }, // Paralimni / Deryneia catchment
    coreRadiusKm: 4,
  },
];

const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));
const CITY_BY_AGENCY = new Map(CITIES.map((c) => [c.agency, c]));

export function cityById(id: CityId): CitySpec | undefined {
  return CITY_BY_ID.get(id);
}

export function cityForAgency(agency: string): CitySpec | undefined {
  return CITY_BY_AGENCY.get(agency as CitySpec["agency"]);
}

/** Nearest city to a lat/lng. Cyprus is small enough that planar distance
 *  is exact-enough for picking — no need for haversine here. Falls back to
 *  Nicosia for the SSR / cold-start case. */
export function nearestCity(lat: number, lng: number): CitySpec {
  let best = CITIES[0];
  let bestD = Infinity;
  for (const c of CITIES) {
    const dLat = c.center.lat - lat;
    const dLng = (c.center.lng - lng) * Math.cos((lat * Math.PI) / 180);
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Haversine distance in km — duplicated locally to keep this module
 *  client-safe (no .server imports). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

/** True when the point is inside the city's core radius. */
export function isInCityCore(
  city: CitySpec,
  point: { lat: number; lng: number },
): boolean {
  return distanceKm(city.center, point) <= city.coreRadiusKm;
}
