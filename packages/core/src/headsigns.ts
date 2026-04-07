/**
 * Lazy loader for compact per-route GTFS trip headsigns.
 *
 * Data file: /gtfs-headsigns.json  built by scripts/build-headsigns.ts
 *   { [routeId]: { trips: { [tripId]: headsignIdx }, headsigns: string[] } }
 *
 * The realtime feed reports trips by their un-namespaced tripId, so we mirror
 * the same key shape. Static bundle is ~380 KB raw / ~80 KB gz — comparable to
 * the existing gtfs-shapes.json bundle, fetched once and cached.
 */

type Bundle = { trips: Record<string, number>; headsigns: string[] };
type HeadsignsIndex = Record<string, Bundle>;

let cache: HeadsignsIndex | null = null;
let inflight: Promise<HeadsignsIndex> | null = null;
const listeners = new Set<() => void>();

/** Subscribe to "headsigns finished loading" — React hook below uses this to
 *  re-render dependent components once the lazy bundle resolves. */
export function onHeadsignsLoaded(fn: () => void): () => void {
  if (cache) { fn(); return () => {}; }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function loadIndex(): Promise<HeadsignsIndex> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/gtfs-headsigns.json", { cache: "force-cache" })
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

/** Kick off the fetch in the background. Safe to call repeatedly. */
export function prefetchHeadsigns() {
  void loadIndex();
}

/** Synchronous lookup — returns null until the index has finished loading. */
export function getHeadsignSync(tripId: string, routeId?: string): string | null {
  if (!cache || !tripId) return null;
  const tryRoute = (rid: string): string | null => {
    const b = cache![rid];
    if (!b) return null;
    const idx = b.trips[tripId];
    // The live feed's trip IDs rotate with each schedule publish, while route
    // direction IDs remain stable. Cyprus encodes each direction as its own
    // route_id in the feeds we bundle, so a single-headsign route is a safe
    // fallback when the exact trip_id no longer exists in the static bundle.
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

/** Async variant — waits for the index to load. */
export async function getHeadsign(tripId: string, routeId?: string): Promise<string | null> {
  await loadIndex();
  return getHeadsignSync(tripId, routeId);
}
