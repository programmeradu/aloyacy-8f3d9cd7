// Kapnos Airport Shuttle suggestions — only fires when one endpoint is at
// LCA/PFO airport and the other is near a Kapnos city station.
import { API_BASE } from "./api";

export type KapnosDeparture = {
  tripId: string;
  departLocal: string;
  arriveLocal: string;
  durationMin: number;
  priceLabel: string;
};

export type KapnosSuggestion = {
  routeId: string;
  routeCode: string;
  routeName: string;
  pickup: { name: string; lat: number; lng: number; distanceM: number };
  dropoff: { name: string; lat: number; lng: number; distanceM: number };
  rideSec: number;
  airportIsOrigin: boolean;
  departures: KapnosDeparture[];
  bookingUrl: string;
  routeUrl: string;
};

export async function fetchKapnos(args: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  afterUnix?: number;
  beforeUnix?: number;
}): Promise<KapnosSuggestion | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/kapnos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
