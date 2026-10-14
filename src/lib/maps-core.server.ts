// Core HTTP client for Mapbox APIs (Geocoding v6, Directions v5).
// Replaces the Google Maps Platform dispatcher (Oct 2026).
//
// Token resolution: MAPBOX_ACCESS_TOKEN (server secret, preferred), then
// MAPBOX_BACKUP_TOKEN on 401/403/429, then the public VITE_MAPBOX_TOKEN.
import { createLogger, serializeError } from "@/lib/logger";

const log = createLogger("maps");

export const MAPBOX_API = "https://api.mapbox.com";

let lastMapsError: { status: number; text: string } | null = null;
export function getLastMapsError() {
  return lastMapsError;
}
export function setLastMapsError(err: { status: number; text: string } | null) {
  lastMapsError = err;
}

function readEnv(name: string): string | undefined {
  const v =
    (typeof process !== "undefined" && process.env?.[name]) ||
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[name] ??
      undefined);
  return v && v.trim() ? v.trim() : undefined;
}

export function mapboxTokens(): string[] {
  const list = [
    readEnv("MAPBOX_ACCESS_TOKEN"),
    readEnv("MAPBOX_BACKUP_TOKEN"),
    readEnv("VITE_MAPBOX_TOKEN"),
  ].filter((t): t is string => Boolean(t));
  return Array.from(new Set(list));
}

/**
 * GET a Mapbox endpoint. `path` is everything after api.mapbox.com, with its
 * query string but without access_token. Retries with the next token on
 * 401/403/429 or a network error.
 */
export async function mapboxFetch(path: string): Promise<Response> {
  const tokens = mapboxTokens();
  if (tokens.length === 0) throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  const sep = path.includes("?") ? "&" : "?";
  let last: Response | null = null;
  for (const token of tokens) {
    try {
      const res = await fetch(`${MAPBOX_API}${path}${sep}access_token=${encodeURIComponent(token)}`);
      if (res.ok || ![401, 403, 429].includes(res.status)) {
        if (!res.ok) {
          const text = await res.clone().text().catch(() => "");
          lastMapsError = { status: res.status, text };
        }
        return res;
      }
      last = res;
      lastMapsError = { status: res.status, text: await res.clone().text().catch(() => "") };
      log.warn("mapbox token rejected, trying next", { status: res.status });
    } catch (err) {
      log.warn("mapbox network error, trying next token", { ...serializeError(err) });
    }
  }
  if (last) return last;
  throw new Error(`Mapbox request failed: ${lastMapsError?.status ?? 0} ${lastMapsError?.text ?? ""}`);
}

export type LngLat = { lat: number; lng: number };
export const coordPair = (p: LngLat) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
