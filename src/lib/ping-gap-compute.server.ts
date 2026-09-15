import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePingGapThresholds, type PingGapThresholds } from "@aloya/core/ping-gap-stats";
import { createLogger } from "@/lib/logger";

const log = createLogger("ping-gap-compute");

// How many days of snapshots to look back.
const LOOKBACK_DAYS = 7;

type PingEvent = {
  timeSec: number;
};

/**
 * A4: Self-Tuning Thresholds.
 * Reads recent vehicle pings, groups by (agency, tripId), computes inter-ping
 * gaps, extracts p75/p95 percentiles, and saves to model_versions.
 */
export async function computeAndStoreThresholds(): Promise<void> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  log.info(`Computing ping gap thresholds from snapshots since ${since}`);

  // Fetch snapshots. We only need the payload->vehicles array and fetchedAt.
  // This could be large, so we page it.
  const db = supabaseAdmin as any;
  const { data: snaps, error } = await db
    .from("rt_snapshots")
    .select("payload")
    .gte("created_at", since);

  if (error) {
    log.error("Failed to fetch rt_snapshots for gap computation", error);
    return;
  }

  if (!snaps || snaps.length === 0) {
    log.info("No snapshots found, skipping A4 computation");
    return;
  }

  // Map: agency -> tripId -> array of ping times (sorted later)
  const agencyTrips = new Map<string, Map<string, number[]>>();

  // E.g. { "trip-101": 35.17,33.36 } to detect if vehicle actually moved
  // (a parked bus shouldn't skew the inter-ping gaps if it's just repeating
  // the exact same coordinate, though GTFS-RT usually handles this by not
  // emitting it if it's off).

  for (const row of snaps) {
    const payload = row.payload as any;
    if (!payload || !Array.isArray(payload.vehicles)) continue;
    
    const timeSec = payload.fetchedAt;
    if (typeof timeSec !== "number") continue;

    for (const v of payload.vehicles) {
      // In GTFS-RT, vehicles don't directly have an agency. We map it via route.
      // For now, if we don't have route-agency mapping in memory here, we might
      // rely on route ID prefixes (e.g., "IC:" -> IC, else NPT/urban).
      const routeId = v.routeId as string;
      if (!routeId) continue;
      
      const agency = routeId.startsWith("IC:") ? "IC" : "NPT";
      const tripId = v.tripId as string;
      if (!tripId) continue;

      let trips = agencyTrips.get(agency);
      if (!trips) {
        trips = new Map();
        agencyTrips.set(agency, trips);
      }
      
      let pings = trips.get(tripId);
      if (!pings) {
        pings = [];
        trips.set(tripId, pings);
      }
      
      pings.push(timeSec);
    }
  }

  // Now compute gaps per agency
  const agencyGaps = new Map<string, number[]>();

  for (const [agency, trips] of agencyTrips.entries()) {
    const gaps: number[] = [];
    
    for (const pings of trips.values()) {
      // Sort times ascending
      pings.sort((a, b) => a - b);
      
      for (let i = 1; i < pings.length; i++) {
        const gap = pings[i] - pings[i - 1];
        // Ignore gaps < 5s (likely same snapshot or duplicate)
        // Ignore gaps > 1800s (30m) (likely bus turned off and on again)
        if (gap >= 5 && gap <= 1800) {
          gaps.push(gap);
        }
      }
    }
    
    agencyGaps.set(agency, gaps);
  }

  const results: PingGapThresholds[] = [];

  for (const [agency, gaps] of agencyGaps.entries()) {
    const result = computePingGapThresholds(gaps, agency);
    if (result) {
      results.push(result);
    } else {
      log.info(`Agency ${agency} has only ${gaps.length} gaps, keeping fallback.`);
    }
  }

  if (results.length === 0) return;

  // Save to model_versions
  const rows = results.map((r) => ({
    name: `ping_gap_${r.agency.toLowerCase()}`,
    params: {
      type: "ping_gap_thresholds",
      agency: r.agency,
      routeId: r.routeId,
      freshSec: r.freshSec,
      ghostSec: r.ghostSec,
      computedAt: new Date().toISOString(),
      sampleCount: r.sampleCount,
    },
  }));

  const { error: insertErr } = await supabaseAdmin
    .from("model_versions")
    .insert(rows);

  if (insertErr) {
    log.error("Failed to insert new threshold versions", insertErr);
  } else {
    log.info(`Saved ${results.length} data-derived freshness thresholds.`);
  }
}
