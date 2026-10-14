// B2 — observed headways for the stop card. One round-trip per stop.

import type { SupabaseClient } from "@/lib/db/compat";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadNoShowSlots } from "@/lib/no-show.functions";
import type { HeadwayObs } from "@aloya/core/headway-chance";

const db = supabaseAdmin as unknown as SupabaseClient;

const schema = z.object({
  routeIds: z.array(z.string().min(1).max(128)).min(1).max(30),
  stopId: z.string().min(1).max(128),
});

type HeadwayRow = {
  route_id: string;
  stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  observed_headway_sec: number;
  scheduled_headway_sec: number;
  sample_count: number;
};

export async function loadHeadwayObs(routeIds: string[], stopId: string): Promise<HeadwayObs[]> {
  const unique = [...new Set(routeIds)].slice(0, 30);
  if (unique.length === 0 || !stopId) return [];
  const { data, error } = await db
    .from("headway_observations")
    .select(
      "route_id, stop_id, hour_of_day, day_of_week, observed_headway_sec, scheduled_headway_sec, sample_count",
    )
    .in("route_id", unique)
    .eq("stop_id", stopId)
    .limit(800);
  if (error || !data) return [];
  return (data as HeadwayRow[]).map((r) => ({
    routeId: r.route_id,
    stopId: r.stop_id,
    hour: r.hour_of_day,
    dow: r.day_of_week,
    observedSec: r.observed_headway_sec,
    scheduledSec: r.scheduled_headway_sec,
    samples: r.sample_count,
  }));
}

export async function loadStopRunHints(routeIds: string[], stopId?: string) {
  const [slots, headways] = await Promise.all([
    loadNoShowSlots(routeIds),
    stopId ? loadHeadwayObs(routeIds, stopId) : Promise.resolve([] as HeadwayObs[]),
  ]);
  return { slots, headways };
}

export const getStopRunHints = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => loadStopRunHints(data.routeIds, data.stopId));
