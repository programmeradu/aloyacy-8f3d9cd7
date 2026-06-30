// Mobile GTFS stop registry — mirrors the web `getStop()` helper but
// reads from the live stops bundle (`/api/public/stops`) cached at runtime
// instead of a bundled JSON. The Today screen seeds the registry once the
// bundle resolves; downstream consumers (eta-v2, DepartureRow, MapView)
// then look up stops synchronously, exactly like the web counterpart.
//
// Keep this module side-effect free: callers populate it via `setStops`.

import type { Stop } from "./api";

let byId = new Map<string, Stop>();
let byAgencyId = new Map<string, Stop>();

export function setStops(stops: Stop[]) {
  const a = new Map<string, Stop>();
  const b = new Map<string, Stop>();
  for (const s of stops) {
    if (!a.has(s.id)) a.set(s.id, s);
    b.set(`${s.agency}:${s.id}`, s);
  }
  byId = a;
  byAgencyId = b;
}

export function getStop(id: string, agency?: string): Stop | undefined {
  if (agency) {
    const hit = byAgencyId.get(`${agency}:${id}`);
    if (hit) return hit;
  }
  return byId.get(id);
}

export function allStops(): Stop[] {
  return Array.from(byId.values());
}

export function stopsReady(): boolean {
  return byId.size > 0;
}
