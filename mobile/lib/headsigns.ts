// Mobile mirror of `packages/core/src/headsigns.ts` — lazy fetches the
// per-route trip → headsign index once and looks it up synchronously.
//
// The web build serves the JSON from `/gtfs-headsigns.json`; on native we
// hit the same file over the API_BASE host.

import { API_BASE } from "./api";

type Bundle = { trips: Record<string, number>; headsigns: string[] };
type HeadsignsIndex = Record<string, Bundle>;

let cache: HeadsignsIndex | null = null;
let inflight: Promise<HeadsignsIndex> | null = null;
const listeners = new Set<() => void>();

export function onHeadsignsLoaded(fn: () => void): () => void {
  if (cache) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function loadIndex(): Promise<HeadsignsIndex> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch(`${API_BASE}/api/public/gtfs-headsigns`, { cache: "force-cache" as RequestCache })
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => {
      cache = j as HeadsignsIndex;
      for (const l of listeners) l();
      listeners.clear();
      return cache!;
    })
    .catch(() => {
      cache = {};
      for (const l of listeners) l();
      listeners.clear();
      return cache!;
    });
  return inflight;
}

export function prefetchHeadsigns() {
  void loadIndex();
}

export function getHeadsignSync(tripId: string, routeId?: string): string | null {
  if (!cache || !tripId) return null;
  const tryRoute = (rid: string): string | null => {
    const b = cache![rid];
    if (!b) return null;
    const idx = b.trips[tripId];
    if (idx == null) return b.headsigns.length === 1 ? b.headsigns[0] : null;
    return b.headsigns[idx] ?? null;
  };
  if (routeId) {
    const hit = tryRoute(routeId);
    if (hit) return hit;
  }
  for (const rid of Object.keys(cache)) {
    const hit = tryRoute(rid);
    if (hit) return hit;
  }
  return null;
}
