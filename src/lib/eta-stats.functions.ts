// Server fns serving segment_speeds + dwell_observations to the
// client-side ETA v2 engine. Keyed by route + current hour/dow so
// we only pull what the rider actually needs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { SegmentStatMap, DwellStatMap } from "./eta-v2";

export const getEtaStatsForRoutes = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        routeIds: z.array(z.string().min(1)).min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const dow = now.getUTCDay();

    const [segRes, dwellRes] = await Promise.all([
      supabase
        .from("segment_speeds")
        .select("route_id, from_stop_id, to_stop_id, mean_mps, sample_count")
        .in("route_id", data.routeIds)
        .eq("hour_of_day", hour)
        .eq("day_of_week", dow),
      supabase
        .from("dwell_observations")
        .select("route_id, stop_id, mean_dwell_sec, sample_count")
        .in("route_id", data.routeIds)
        .eq("hour_of_day", hour)
        .eq("day_of_week", dow),
    ]);

    const segments: SegmentStatMap = {};
    for (const r of segRes.data ?? []) {
      segments[`${r.route_id}|${r.from_stop_id}|${r.to_stop_id}`] = {
        meanMps: r.mean_mps ?? 0,
        sampleCount: r.sample_count ?? 0,
      };
    }
    const dwells: DwellStatMap = {};
    for (const r of dwellRes.data ?? []) {
      dwells[`${r.route_id}|${r.stop_id}`] = {
        meanDwellSec: r.mean_dwell_sec ?? 0,
        sampleCount: r.sample_count ?? 0,
      };
    }
    return { segments, dwells };
  });
