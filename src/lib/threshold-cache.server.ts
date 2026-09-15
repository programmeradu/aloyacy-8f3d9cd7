// Cache for data-derived ETA freshness thresholds (A4).
//
// Periodically fetched from the `model_versions` table where the weekly
// ping-gap cron writes them. Kept in memory (with a TTL) because ETA
// calculation is on the hot path and cannot wait for a DB roundtrip.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogger } from "@/lib/logger";

const log = createLogger("threshold-cache");

export type ThresholdOverrides = {
  fresh?: number;
  ghost?: number;
};

// Cache structure: Map<agency_or_route, overrides>
let cache = new Map<string, ThresholdOverrides>();
let cacheLastUpdated = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Track the in-flight fetch so we don't stampede the database.
let fetchPromise: Promise<void> | null = null;

/**
 * Get the freshness overrides for an agency (or specific route).
 * If the cache is stale or empty, triggers a background refresh
 * and returns the stale/empty result immediately.
 * 
 * Safe to call on the hot path.
 */
export function getThresholdOverrides(
  agency: string,
  routeId?: string,
): ThresholdOverrides | undefined {
  const now = Date.now();
  if (now - cacheLastUpdated > CACHE_TTL_MS && !fetchPromise) {
    fetchPromise = refreshCache().finally(() => {
      fetchPromise = null;
    });
  }

  // Route-specific thresholds are preferred over agency-wide.
  if (routeId) {
    const routeThresholds = cache.get(routeId);
    if (routeThresholds) return routeThresholds;
  }
  
  return cache.get(agency);
}

async function refreshCache(): Promise<void> {
  try {
    // We store A4 threshold sets in model_versions as it's our canonical
    // place for parameterized tuning. We fetch all rows where params
    // has a 'type': 'ping_gap_thresholds'.
    const { data, error } = await supabaseAdmin
      .from("model_versions")
      .select("id, params")
      .eq("params->>type", "ping_gap_thresholds");

    if (error) throw error;
    if (!data) return;

    const newCache = new Map<string, ThresholdOverrides>();

    for (const row of data) {
      if (typeof row.params === "object" && row.params !== null) {
        const p = row.params as any;
        const fresh = typeof p.freshSec === "number" ? p.freshSec : undefined;
        const ghost = typeof p.ghostSec === "number" ? p.ghostSec : undefined;
        const target = p.routeId || p.agency;
        
        if (target && (fresh !== undefined || ghost !== undefined)) {
          newCache.set(target, { fresh, ghost });
        }
      }
    }

    cache = newCache;
    cacheLastUpdated = Date.now();
    log.info(`Refreshed threshold cache, loaded ${newCache.size} overrides`);
  } catch (err) {
    log.error("Failed to refresh threshold cache", err);
    // Don't retry immediately.
    cacheLastUpdated = Date.now();
  }
}

/** 
 * Force an immediate refresh and wait for it.
 * Used in tests or when a cron job finishes computing new values.
 */
export async function forceRefreshThresholds(): Promise<void> {
  if (fetchPromise) await fetchPromise;
  fetchPromise = refreshCache().finally(() => {
    fetchPromise = null;
  });
  return fetchPromise;
}
