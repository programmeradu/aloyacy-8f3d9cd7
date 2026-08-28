// Lovable Cloud public API surface. Same backend as the web app — never fork.
// Prefer the custom domain — the *.lovable.app subdomain does not send
// permissive CORS headers, which breaks Expo web running on localhost.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://app.aloya.cy";

// Cloudflare custom domain first, Lovable's origin second. Native clients can
// retry the origin when DNS, a Cloudflare edge, or a custom-domain deployment
// is temporarily unavailable. Never retry ordinary 4xx responses: those are
// real request errors, not infrastructure failures.
const LOVABLE_ORIGIN = "https://aloyacy.lovable.app";
export const API_BASES = Array.from(new Set([API_BASE, LOVABLE_ORIGIN]));

export async function fetchPublicApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (const base of API_BASES) {
    try {
      const response = await fetch(`${base}${path}`, init);
      if (response.status < 500) return response;
      lastError = new Error(`${base} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Aloya services are temporarily unavailable");
}

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
  source: "feed" | "rider" | "feed+rider";
};

export type RealtimeSnapshot = {
  fetchedAt: number;
  vehicles: RealtimeVehicle[];
  arrivals: RealtimeArrival[];
  ghostTripIds?: string[];
  riderConfirmedTrips?: { tripId: string; ageSec: number; count?: number }[];
  stale?: boolean;
};

export async function fetchRealtime(): Promise<RealtimeSnapshot> {
  const res = await fetchPublicApi("/api/public/realtime", {
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

/**
 * Stop sequences keyed `"<routeId>|<directionId>"`. Powers the on-board
 * countdown; fetched once and cached for the day.
 */
export async function fetchRouteSequences(): Promise<Record<string, string[]>> {
  const res = await fetchPublicApi("/api/public/route-sequences", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Route sequences ${res.status}`);
  return (await res.json()) as Record<string, string[]>;
}

export async function fetchStopsBundle(): Promise<StopsBundle> {
  const res = await fetchPublicApi("/api/public/stops", {
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

