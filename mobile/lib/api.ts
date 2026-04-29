// Lovable Cloud public API surface. Same backend as the web app — never fork.
// Prefer the custom domain — the *.lovable.app subdomain does not send
// permissive CORS headers, which breaks Expo web running on localhost.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://app.aloya.cy";

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
  riderConfirmedTrips?: { tripId: string; ageSec: number }[];
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
  const raw = (await res.json()) as {
    stops: Stop[];
    routes: Record<string, RouteMeta> | Array<RouteMeta & { id: string }>;
  };
  // API returns `routes` as an array keyed by `id`; normalize to a map so
  // consumers can do `routes[routeId].short` uniformly.
  let routes: Record<string, RouteMeta>;
  if (Array.isArray(raw.routes)) {
    routes = {};
    for (const r of raw.routes) routes[r.id] = r;
  } else {
    routes = raw.routes ?? {};
  }
  return { stops: raw.stops, routes };
}

