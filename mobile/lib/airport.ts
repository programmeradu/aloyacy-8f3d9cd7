// Airport page data client — thin wrapper over the public airport endpoint.
// Mirrors the shape returned by `src/lib/airport.functions.ts`.
import { API_BASE } from "./api";

export type AirportCode = "lca" | "pfo";

export type AirportMeta = {
  code: AirportCode;
  iata: string;
  icao: string;
  name: string;
  nameEl: string;
  city: string;
  cityEl: string;
  lat: number;
  lng: number;
};

export type AirportCoachDeparture = {
  tripId: string;
  depart: string;
  arrive: string;
  dayChip: string;
  seatsAvailable: number;
  priceFrom: string | null;
};

export type AirportCoachLine = {
  routeId: string;
  routeCode: string;
  destinationCity: string;
  routeName: string;
  pickupName: string;
  dropoffName: string;
  dropoffLat: number;
  dropoffLng: number;
  rideMin: number;
  priceFrom: string | null;
  nextDepartures: AirportCoachDeparture[];
};

export type AirportPageData = {
  airport: AirportMeta;
  coachLines: AirportCoachLine[];
  flights: unknown;
};

// GTFS stop that anchors urban departures per airport (mirror of web).
export const AIRPORT_STOP: Record<AirportCode, string> = {
  lca: "6117",
  pfo: "1813",
};

export async function fetchAirportPage(code: AirportCode): Promise<AirportPageData> {
  const res = await fetch(`${API_BASE}/api/public/airport?code=${code}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Airport ${res.status}`);
  return res.json();
}
