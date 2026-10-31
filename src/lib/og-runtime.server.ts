// Share cards drawn per link on the Worker (Workers Paid; limits.cpu_ms in
// deploy/wrangler.newacct.jsonc), cached so each card is drawn once.
//
// Order: Cache API (edge, per colo; a no-op on workers.dev until a custom
// domain is attached) -> KV OG_CACHE (global) -> draw with resvg -> store in
// both. Any failure, or OG_RUNTIME="off", serves the build-time fallback
// files in dist/client/og instead (see scripts/og-prerender.ts).

import { loadShapes, renderPng, setOgNetwork, type Shapes } from "@/lib/og-roam.server";
import { ogAsset } from "@/lib/og-asset";

/** Bump when card design changes so cached cards are redrawn. */
export const OG_VERSION = "roam-4";

type KV = {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, o?: { expirationTtl?: number }): Promise<void>;
};
type Env = {
  ASSETS?: { fetch: (r: Request) => Promise<Response> };
  OG_CACHE?: KV;
  OG_RUNTIME?: string;
};

async function env(): Promise<Env> {
  let e: Env = {};
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore runtime module of workerd, no types in this project
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env?: Env };
    e = mod?.env ?? {};
  } catch {
    // not on workerd
  }
  if (!e.ASSETS) {
    try {
      const { getWorkerEnv } = await import("./worker-env");
      e = { ...((getWorkerEnv() ?? {}) as Env), ...e };
    } catch {
      // ignore
    }
  }
  return e;
}

type Net = {
  shapes: Record<string, { shapes: Record<string, string> }>;
  seq: Record<string, string[]>;
  routeStops: Record<string, string[]>;
};

/** Bundled Nicosia shapes plus the island network from og/network.json, once per isolate. */
export function ogShapes(): Promise<Shapes | null> {
  const G = globalThis as unknown as { __aloya_og_net?: Promise<Shapes | null> };
  if (!G.__aloya_og_net) {
    G.__aloya_og_net = (async () => {
      const base: Shapes = { ...((await loadShapes()) ?? {}) };
      const e = await env();
      try {
        const res = e.ASSETS
          ? await e.ASSETS.fetch(new Request("https://assets.local/og/network.json"))
          : null;
        if (res?.ok) {
          const net = (await res.json()) as Net;
          for (const [rid, v] of Object.entries(net.shapes))
            if (!base[rid]?.shapes) base[rid] = { ...(base[rid] ?? {}), shapes: v.shapes };
          setOgNetwork(net);
        }
      } catch {
        // Nicosia data only
      }
      return base;
    })().catch(() => null);
  }
  return G.__aloya_og_net;
}

const CY = (unix: number, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Nicosia", ...o }).format(
    new Date(unix * 1000),
  );
/** "08:42" in Cyprus time. */
export const cyTime = (unix: number) =>
  CY(unix, { hour: "2-digit", minute: "2-digit", hour12: false });
/** "Sat 31 Oct" in Cyprus time. */
export const cyDay = (unix: number) =>
  CY(unix, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

/**
 * Serve the card for `key`, drawing it with `draw` on a cache miss.
 * `fallback` lists build-time files to serve if drawing is off or fails.
 */
export async function ogRender(
  request: Request,
  key: string,
  ttl: number,
  draw: (shapes: Shapes | null) => string | Promise<string>,
  fallback: string[],
): Promise<Response> {
  const e = await env();
  if (e.OG_RUNTIME === "off") return ogAsset(request, fallback, Math.min(ttl, 3600));
  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=86400`,
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  };
  const id = `${OG_VERSION}/${key}`;
  const cacheKey = new Request(`https://og-cache.aloya.cy/${id}`);
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      r.headers.set("X-OG", "edge");
      return r;
    }
  } catch {
    // ignore
  }
  try {
    const buf = await e.OG_CACHE?.get(id, "arrayBuffer");
    if (buf) {
      const r = new Response(buf, { headers: { ...headers, "X-OG": "kv" } });
      await cache?.put(cacheKey, r.clone()).catch(() => {});
      return r;
    }
  } catch {
    // ignore
  }
  try {
    const shapes = await ogShapes();
    const png = await renderPng(await draw(shapes));
    const r = new Response(png as BlobPart, {
      headers: { ...headers, "Content-Length": String(png.byteLength), "X-OG": "drawn" },
    });
    await Promise.all([
      cache?.put(cacheKey, r.clone()).catch(() => {}),
      e.OG_CACHE?.put(id, png, { expirationTtl: Math.max(60, ttl) }).catch(() => {}),
    ]);
    return r;
  } catch (err) {
    console.warn(`og: draw failed for ${key}: ${String((err as Error)?.message ?? err)}`);
    return ogAsset(request, fallback, 600);
  }
}

/**
 * Draw a card without caching it: the in-app share picture with live numbers
 * (next bus in N min) changes every minute, so it is drawn per request.
 */
export async function ogDraw(
  request: Request,
  draw: (shapes: Shapes | null) => string | null | Promise<string | null>,
  fallback: string[],
): Promise<Response> {
  try {
    const shapes = await ogShapes();
    const svg = await draw(shapes);
    if (!svg) return ogAsset(request, fallback, 60);
    const png = await renderPng(svg);
    return new Response(png as BlobPart, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
        "Cache-Control": "private, max-age=30",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "X-OG": "drawn-live",
      },
    });
  } catch (err) {
    console.warn(`og: live draw failed: ${String((err as Error)?.message ?? err)}`);
    return ogAsset(request, fallback, 60);
  }
}
