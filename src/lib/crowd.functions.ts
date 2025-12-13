// Crowd / comfort estimation for an active ride. Reads aggregated
// route_load_estimates (populated by the rider-fix reporter pipeline).
// Surfaces a friendly "quiet / busy / packed" hint in the HUD.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const schema = z.object({
  routeId: z.string().min(1).max(64),
  tripId: z.string().min(1).max(128).optional(),
});

export type CrowdLevel = "quiet" | "moderate" | "busy" | "packed";

export const getRouteLoad = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("route_load_estimates")
      .select("load_index, rider_count, window_start, trip_id")
      .eq("route_id", data.routeId)
      .gte("window_start", since)
      .order("window_start", { ascending: false })
      .limit(8);

    if (!rows || rows.length === 0) {
      return { level: null as CrowdLevel | null, riders: 0, sample: 0 };
    }

    // Prefer trip-specific samples when present.
    const tripRows = data.tripId
      ? rows.filter((r) => r.trip_id === data.tripId)
      : [];
    const pick = tripRows.length > 0 ? tripRows : rows;
    const avgLoad =
      pick.reduce((sum, r) => sum + (r.load_index ?? 0), 0) / pick.length;
    const avgRiders = Math.round(
      pick.reduce((sum, r) => sum + (r.rider_count ?? 0), 0) / pick.length,
    );

    let level: CrowdLevel = "quiet";
    if (avgLoad >= 0.85) level = "packed";
    else if (avgLoad >= 0.6) level = "busy";
    else if (avgLoad >= 0.3) level = "moderate";

    return { level, riders: avgRiders, sample: pick.length };
  });
