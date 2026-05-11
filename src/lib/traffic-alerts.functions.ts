// Wave 3 — Traffic alerts on the rider's plan.
//
// The CyNAP DATEX II ingest (`/api/public/hooks/pulse-traffic`) already
// lands live island-wide incidents in `pulse_signals` (key='traffic',
// scope='island' or per-zone). Pulse renders them as ambient context.
// This module surfaces ONLY the incidents that actually intersect the
// rider's planned itinerary — the actionable moment.
//
// Approach:
//   • Caller passes a set of sample points from the itinerary (board /
//     alight coords for every ride leg, plus walk endpoints).
//   • We read the freshest `traffic` rows (island + all zones) and pick
//     any incident within `RADIUS_M` of any sample point.
//   • Dedup by incident id, sort by (severity desc, distance asc),
//     return at most `MAX_ALERTS` hits.
//
// Honesty rules:
//   • No incidents in feed → return null (never a fake "all clear").
//   • Feed stale > 60 min → return null; we don't want to shout about
//     yesterday's roadworks.
//   • Distance to itinerary rounded to 100 m and shown as-is.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { distanceM } from "./geo";
import type { TrafficIncidentLite, TrafficLivePayload } from "./pulse-live.functions";

const RADIUS_M = 500;
const MAX_ALERTS = 4;
const MAX_STALE_MS = 60 * 60_000;

export type ItineraryTrafficAlert = TrafficIncidentLite & {
  /** Rounded distance (m) from the nearest sample point on the itinerary. */
  distanceFromPathM: number;
};

export type ItineraryTrafficReport = {
  /** Highest severity across the surfaced alerts. */
  highest: "low" | "medium" | "high";
  alerts: ItineraryTrafficAlert[];
  observedAt: string;
};

const Point = z.object({ lat: z.number(), lng: z.number() });

const SEVERITY_RANK: Record<TrafficIncidentLite["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const getItineraryTrafficAlerts = createServerFn({ method: "POST" })
  .inputValidator((input: { points: Array<{ lat: number; lng: number }> }) =>
    z.object({ points: z.array(Point).min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }): Promise<ItineraryTrafficReport | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("pulse_signals")
      .select("scope, payload, fetched_at")
      .eq("key", "traffic")
      .gte("fetched_at", new Date(Date.now() - MAX_STALE_MS).toISOString())
      .order("fetched_at", { ascending: false });

    if (error || !rows || rows.length === 0) return null;

    type Row = { scope: string; payload: Record<string, unknown>; fetched_at: string };

    // Dedupe: first (newest) row per scope wins, and we merge incidents
    // across scopes but never re-count the same incident twice.
    const seen = new Set<string>();
    const merged: TrafficIncidentLite[] = [];
    let newestFetched = "";
    for (const r of rows as Row[]) {
      if (r.fetched_at > newestFetched) newestFetched = r.fetched_at;
      const payload = r.payload as unknown as TrafficLivePayload | null;
      if (!payload || !Array.isArray(payload.incidents)) continue;
      for (const inc of payload.incidents) {
        if (inc.lat == null || inc.lng == null) continue;
        if (seen.has(inc.id)) continue;
        seen.add(inc.id);
        merged.push(inc);
      }
    }
    if (merged.length === 0) return null;

    // Nearest-point distance from each incident to the itinerary sample set.
    const hits: ItineraryTrafficAlert[] = [];
    for (const inc of merged) {
      let best = Infinity;
      for (const p of data.points) {
        const d = distanceM({ lat: inc.lat!, lng: inc.lng! }, p);
        if (d < best) best = d;
        if (best <= 25) break; // can't get closer meaningfully
      }
      if (best <= RADIUS_M) {
        hits.push({
          ...inc,
          distanceFromPathM: Math.round(best / 50) * 50,
        });
      }
    }
    if (hits.length === 0) return null;

    hits.sort((a, b) => {
      const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (sev !== 0) return sev;
      return a.distanceFromPathM - b.distanceFromPathM;
    });

    const trimmed = hits.slice(0, MAX_ALERTS);
    const highest: ItineraryTrafficReport["highest"] = trimmed.some(
      (a) => a.severity === "high",
    )
      ? "high"
      : trimmed.some((a) => a.severity === "medium")
        ? "medium"
        : "low";

    return {
      highest,
      alerts: trimmed,
      observedAt: newestFetched,
    };
  });
