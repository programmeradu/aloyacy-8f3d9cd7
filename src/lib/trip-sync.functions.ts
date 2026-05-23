// Persist the device's currently planned journey on the server so a
// background scheduler can fire push alerts even when the app is closed,
// the tab is hidden, or the phone is locked. Client mirrors localStorage
// to this table on start / end of trip.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Legs are stored as opaque jsonb on the server. We validate only the outer
// shape here — the cron alert dispatcher does its own narrow reads with
// runtime guards (we never trust client legs blindly for anything risky;
// they only drive notifications scoped to the same device).
const upsertSchema = z.object({
  deviceId: z.string().min(8).max(128),
  tripId: z.string().min(1).max(160),
  routeShort: z.string().max(16).optional(),
  boardStopId: z.string().max(64).optional(),
  boardName: z.string().max(160).optional(),
  boardUnix: z.number().int().optional(),
  alightStopId: z.string().max(64).optional(),
  alightName: z.string().max(160).optional(),
  alightUnix: z.number().int().optional(),
  walkInSec: z.number().int().min(0).max(7200).default(0),
  walkOutSec: z.number().int().min(0).max(7200).default(0),
  // Multi-leg additions (Phase 4). All optional so older clients still work.
  itineraryId: z.string().max(200).optional(),
  totalArrivalUnix: z.number().int().optional(),
  legs: z.array(z.unknown()).max(20).optional(),
});

export const upsertActiveTrip = createServerFn({ method: "POST" })
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("active_trips")
      .upsert(
        {
          device_id: data.deviceId,
          trip_id: data.tripId,
          route_short: data.routeShort ?? null,
          board_stop_id: data.boardStopId ?? null,
          board_name: data.boardName ?? null,
          board_unix: data.boardUnix ?? null,
          alight_stop_id: data.alightStopId ?? null,
          alight_name: data.alightName ?? null,
          alight_unix: data.alightUnix ?? null,
          walk_in_sec: data.walkInSec,
          walk_out_sec: data.walkOutSec,
          alerts_sent: [],
          legs: data.legs ?? null,
          itinerary_id: data.itineraryId ?? null,
          total_arrival_unix: data.totalArrivalUnix ?? null,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" },
      );
    if (error) {
      console.error("[trip-sync] upsert failed", error);
      throw new Error("Could not save trip for background alerts");
    }
    return { ok: true as const };
  });

const removeSchema = z.object({ deviceId: z.string().min(8).max(128) });

export const removeActiveTrip = createServerFn({ method: "POST" })
  .inputValidator((input) => removeSchema.parse(input))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("active_trips").delete().eq("device_id", data.deviceId);
    return { ok: true as const };
  });
