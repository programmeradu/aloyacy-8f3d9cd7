// Server fns for the learning pipeline output (delay_stats).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const getLearnedStatsForStop = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ stopId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const dow = now.getUTCDay();
    const { data: rows, error } = await supabase
      .from("delay_stats")
      .select("route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count")
      .eq("stop_id", data.stopId)
      .eq("hour_of_day", hour)
      .eq("day_of_week", dow);
    if (error) {
      console.error("delay_stats read failed", error);
      return { stats: [] };
    }
    return { stats: rows ?? [] };
  });

/**
 * Bulk lookup for a list of stops — used by the home page to apply
 * learned bias to every nearby stop card in a single round-trip.
 * Returns a flat array of stats; client builds its own keyed map.
 */
export const getLearnedStatsBulk = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ stopIds: z.array(z.string().min(1)).min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const dow = now.getUTCDay();
    const { data: rows, error } = await supabase
      .from("delay_stats")
      .select("route_id, stop_id, mean_delay_sec, sample_count")
      .in("stop_id", data.stopIds)
      .eq("hour_of_day", hour)
      .eq("day_of_week", dow);
    if (error) {
      console.error("delay_stats bulk read failed", error);
      return { stats: [] };
    }
    return { stats: rows ?? [] };
  });
