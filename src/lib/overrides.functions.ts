// Override learning loop.
//
// When riders override a planned itinerary — skipped a transfer and walked
// the rest, alighted early, etc. — we log the deviation. The planner then
// applies a small bias to future scoring for the same origin/destination
// bucket so it stops suggesting the same flawed itinerary.
//
// "Same OD" is bucketed by rounding lat/lng to ~110 m (3 decimals).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PointSchema = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
});

const LogSchema = z.object({
  deviceId: z.string().min(8).max(128),
  from: PointSchema,
  to: PointSchema,
  plannedLegs: z.array(z.unknown()).max(20),
  actualLegs: z.array(z.unknown()).max(20).optional(),
  kind: z.enum(["skipped-transfer", "early-alight", "manual-arrived"]),
});

export const logTripOverride = createServerFn({ method: "POST" })
  .inputValidator((input) => LogSchema.parse(input))
  .handler(async ({ data }) => {
    const d = new Date();
    const { error } = await supabaseAdmin.from("trip_overrides").insert({
      device_id: data.deviceId,
      from_lat: data.from.lat,
      from_lng: data.from.lng,
      to_lat: data.to.lat,
      to_lng: data.to.lng,
      planned_legs: data.plannedLegs as unknown as never,
      actual_legs: (data.actualLegs ?? null) as unknown as never,
      kind: data.kind,
      hour: d.getHours(),
      dow: d.getDay(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

