// Share cards are drawn at build time (scripts/og-prerender.ts) into
// dist/client/og/. The /api/public/og/* endpoints only look up the matching
// static file through the ASSETS binding: no drawing on request, which the
// Workers free plan CPU limit (~10 ms) cannot afford.

export const TRIP_SHARDS = 64;

/** Stable shard for a GTFS trip id (shared by the build script and the worker). */
export function tripShard(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % TRIP_SHARDS;
}

export const SAFE_ID = /^[A-Za-z0-9_-]{1,32}$/;

/** 0.05 degree grid cell name for the og/near/<cell>.json stop lists. */
export function nearCell(lat: number, lng: number): string {
  return `${Math.floor(lat * 20)}_${Math.floor(lng * 20)}`;
}

type Assets = { fetch: (r: Request) => Promise<Response> };

async function assets(): Promise<Assets | null> {
  type Env = { ASSETS?: Assets };
  let env: Env = {};
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore runtime module of workerd, no types in this project
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env?: Env };
    env = mod?.env ?? {};
  } catch {
    // not on workerd
  }
  if (!env.ASSETS) {
    try {
      const { getWorkerEnv } = await import("./worker-env");
      env = (getWorkerEnv() ?? {}) as Env;
    } catch {
      env = {};
    }
  }
  return env.ASSETS ?? null;
}

async function fetchAsset(path: string, origin: string): Promise<Response | null> {
  const a = await assets();
  try {
    const res = a
      ? await a.fetch(new Request(`https://assets.local${path}`))
      : await fetch(new URL(path, origin));
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/**
 * The first static card that exists among `paths` (then og/default.png),
 * as a PNG response with crawler-friendly headers.
 */
export async function ogAsset(
  request: Request,
  paths: string[],
  cacheSeconds = 3600,
): Promise<Response> {
  const origin = new URL(request.url).origin;
  for (const p of [...paths, "/og/default.png"]) {
    const res = await fetchAsset(p, origin);
    if (!res) continue;
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) continue;
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=600`,
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new Response("Not found", { status: 404 });
}

export type TripInfo = { routeId: string; depart: string; from: string; to: string; short: string };

/** Line, first departure and end stops of a GTFS trip, from the sharded build-time index. */
export async function tripInfo(request: Request, tripId: string): Promise<TripInfo | null> {
  if (!SAFE_ID.test(tripId)) return null;
  const res = await fetchAsset(`/og/trips/${tripShard(tripId)}.json`, new URL(request.url).origin);
  if (!res) return null;
  try {
    const map = (await res.json()) as Record<string, string | string[]>;
    const v = map[tripId];
    if (!v) return null;
    if (typeof v === "string") return { routeId: v, depart: "", from: "", to: "", short: "" };
    return { routeId: v[0], depart: v[1] ?? "", from: v[2] ?? "", to: v[3] ?? "", short: v[4] ?? "" };
  } catch {
    return null;
  }
}

/** Route id for a GTFS trip id, from the sharded build-time index. */
export async function routeForTrip(request: Request, tripId: string): Promise<string | null> {
  return (await tripInfo(request, tripId))?.routeId ?? null;
}
