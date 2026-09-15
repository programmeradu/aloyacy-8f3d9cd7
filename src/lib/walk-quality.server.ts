// Server-side module to fetch stop walkability metrics and Google-verified walk
// links to feed the D3 RAPTOR penalty model.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogger } from "@/lib/logger";

const log = createLogger("walk-quality");

export type StopWalkQuality = {
  stopId: string;
  reachableOnFoot: "yes" | "no_crossing" | "no_sidewalk" | null;
};

export type VerifiedWalkLink = {
  fromStopId: string;
  toStopId: string;
  distanceM: number;
  durationSec: number;
};

/**
 * Load the walk quality attributes for a batch of stops.
 * Used at the start of a RAPTOR request to populate the walk penalty index.
 */
export async function loadStopWalkQuality(stopIds: string[]): Promise<Map<string, StopWalkQuality>> {
  if (!stopIds.length) return new Map();

  const out = new Map<string, StopWalkQuality>();
  
  try {
    // Only load conditions that matter for routing penalties
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("stop_conditions")
      .select("stop_id, attribute, value")
      .eq("attribute", "reachable_on_foot")
      .in("stop_id", stopIds);

    if (error) {
      log.warn("Failed to load stop walk quality", { err: error.message });
      return out; // degrade gracefully
    }

    if (Array.isArray(data)) {
      for (const row of data) {
        if (row.value === "yes" || row.value === "no_crossing" || row.value === "no_sidewalk") {
          out.set(row.stop_id, {
            stopId: row.stop_id,
            reachableOnFoot: row.value,
          });
        }
      }
    }
  } catch (err) {
    log.error("Unexpected error loading walk quality", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return out;
}

/**
 * Load verified Google walk links covering any permutations of the requested stops.
 * Because A->B and B->A share a canonical row, we fetch all links where both
 * stops are in the candidate set.
 */
export async function loadVerifiedWalkLinks(stopIds: string[]): Promise<Map<string, VerifiedWalkLink>> {
  if (!stopIds.length) return new Map();
  
  const out = new Map<string, VerifiedWalkLink>();

  try {
    // A walk link only applies if both the origin and destination are in our
    // active set of RAPTOR candidates. By filtering where both from_stop_id
    // and to_stop_id are in the candidate set, we keep the payload bounded.
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("walk_links")
      .select("from_stop_id, to_stop_id, distance_m, duration_sec, verified")
      .eq("verified", true)
      .in("from_stop_id", stopIds)
      .in("to_stop_id", stopIds);

    if (error) {
      log.warn("Failed to load walk links", { err: error.message });
      return out;
    }

    if (Array.isArray(data)) {
      for (const row of data) {
        const key = `${row.from_stop_id}|${row.to_stop_id}`;
        // Canonical key in the other direction too, since walk links are bi-directional
        // in our schedule usage (elevation asymmetries aren't handled yet).
        const revKey = `${row.to_stop_id}|${row.from_stop_id}`;
        
        const link = {
          fromStopId: row.from_stop_id,
          toStopId: row.to_stop_id,
          distanceM: row.distance_m,
          durationSec: row.duration_sec,
        };

        out.set(key, link);
        out.set(revKey, link);
      }
    }
  } catch (err) {
    log.error("Unexpected error loading walk links", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return out;
}
