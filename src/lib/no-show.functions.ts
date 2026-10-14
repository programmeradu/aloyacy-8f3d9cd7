// B3 — no-show rates for the stop card. One round-trip per stop, then the
// client matches each departure's Cyprus hour.

import type { SupabaseClient } from "@/lib/db/compat";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyYmd } from "@aloya/core/cy-time";
import {
  NO_SHOW_WINDOW_DAYS,
  tallyNoShows,
  type NoShowRow,
  type NoShowSlot,
} from "@aloya/core/no-show";

const db = supabaseAdmin as unknown as SupabaseClient;

const schema = z.object({
  routeIds: z.array(z.string().min(1).max(128)).min(1).max(30),
});

export type { NoShowSlot };

export async function loadNoShowSlots(
  routeIds: string[],
  nowMs = Date.now(),
): Promise<NoShowSlot[]> {
  const unique = [...new Set(routeIds)].slice(0, 30);
  if (unique.length === 0) return [];
  const from = cyYmd(nowMs - NO_SHOW_WINDOW_DAYS * 86_400_000);
  const { data, error } = await db
    .from("trip_no_shows")
    .select("route_id, detected_at, hour_of_day, day_of_week")
    .in("route_id", unique)
    .gte("service_date", from)
    .limit(4000);
  if (error || !data) return [];
  return [...tallyNoShows(data as NoShowRow[]).values()];
}

export const getNoShowSlots = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => loadNoShowSlots(data.routeIds));
