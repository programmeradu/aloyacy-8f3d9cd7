// Core dispatcher and failover logic for Google Maps Platform APIs.
import { createLogger, serializeError } from "@/lib/logger";

const log = createLogger("maps");

let lastMapsError: { status: number; text: string } | null = null;
export function getLastMapsError() {
  return lastMapsError;
}
export function setLastMapsError(err: { status: number; text: string } | null) {
  lastMapsError = err;
}


export function authHeaders(extra: Record<string, string> = {}) {
  const lk = process.env.LOVABLE_API_KEY;
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  const clientKey = process.env.GOOGLE_MAPS_API_KEY;
  const effectiveKey = serverKey || clientKey;

  if (!lk && !effectiveKey) {
    throw new Error("LOVABLE_API_KEY or GOOGLE_MAPS_API_KEY missing");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };

  if (effectiveKey) {
    headers["X-Connection-Api-Key"] = effectiveKey;
  }

  if (lk) {
    headers.Authorization = `Bearer ${lk}`;
    headers["X-Connection-Id"] =
      process.env.GOOGLE_MAPS_CONNECTION_ID || "std_01ks89na5gfj8ar9b3vtc8qg92";
  }

  return headers;
}

export interface MapsRequestPlan {
  direct: (key: string) => {
    url: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  };
  gateway: () => {
    url: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  };
}

/**
 * Executes a Google Maps request with direct key prioritization,
 * fallback key failover on 403/429/network errors, and Lovable gateway fallback.
 */
export async function fetchMapsWithFailover(plan: MapsRequestPlan): Promise<Response> {
  const primaryKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const backupKey = process.env.GOOGLE_MAPS_BACKUP_KEY;
  const directKeys = [primaryKey, backupKey].filter((k): k is string => Boolean(k && k.trim()));

  // 1. Attempt direct Google Maps Platform endpoints using configured direct keys
  for (const key of directKeys) {
    try {
      const { url, method = "GET", headers = {}, body } = plan.direct(key);
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          ...headers,
        },
        body,
      });

      // If success or expected client error (e.g. 404/400 bad placeId), return response
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 403 && res.status !== 429)) {
        return res;
      }

      const errText = await res.text().catch(() => "");
      lastMapsError = { status: res.status, text: errText };
      log.warn("direct Google Maps API status error, attempting key failover", {
        status: res.status,
        url,
      });
    } catch (err) {
      log.warn("direct Google Maps API network error, attempting key failover", {
        ...serializeError(err),
      });
    }
  }

  // 2. Fall back to Lovable connector gateway if LOVABLE_API_KEY is available
  if (process.env.LOVABLE_API_KEY) {
    try {
      const { url, method = "GET", headers = {}, body } = plan.gateway();
      const gwHeaders = authHeaders(headers);
      const res = await fetch(url, {
        method,
        headers: gwHeaders,
        body,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastMapsError = { status: res.status, text: errText };
      }
      return res;
    } catch (err) {
      log.error("Lovable gateway request failed", undefined, { ...serializeError(err) });
      throw err;
    }
  }

  // 3. No direct keys configured and no Lovable key
  if (directKeys.length === 0) {
    throw new Error("Neither GOOGLE_MAPS_SERVER_KEY nor LOVABLE_API_KEY is configured");
  }

  throw new Error(
    `Google Maps request failed across all providers: ${lastMapsError?.status ?? 500} - ${
      lastMapsError?.text ?? "No error details"
    }`,
  );
}
