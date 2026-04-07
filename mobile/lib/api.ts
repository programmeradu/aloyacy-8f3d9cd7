// Lovable Cloud public API surface. Same backend as the web app — never fork.
export const API_BASE = "https://aloyacy.lovable.app";

export type RealtimeArrival = {
  stopId: string;
  routeId: string;
  tripId: string;
  arrivalUnix: number;
  delaySec: number;
};

export type RealtimeVehicle = {
  id: string;
  routeId: string;
  tripId: string;
  lat: number;
  lng: number;
  bearing: number | null;
  speed: number | null;
  label: string | null;
  timestamp: number;
  source: "feed" | "rider";
};

export type RealtimeSnapshot = {
  fetchedAt: number;
  vehicles: RealtimeVehicle[];
  arrivals: RealtimeArrival[];
  ghostTripIds?: string[];
  riderConfirmedTrips?: string[];
  stale?: boolean;
};

export async function fetchRealtime(): Promise<RealtimeSnapshot> {
  const res = await fetch(`${API_BASE}/api/public/realtime`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Realtime ${res.status}`);
  return res.json();
}

export type Stop = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  agency: string;
};

export type RouteMeta = {
  short: string;
  long: string;
  color: string;
  feedId: number;
  type: number;
};

export type StopsBundle = {
  stops: Stop[];
  routes: Record<string, RouteMeta>;
};

export async function fetchStopsBundle(): Promise<StopsBundle> {
  const res = await fetch(`${API_BASE}/api/public/stops`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Stops ${res.status}`);
  return res.json();
}
