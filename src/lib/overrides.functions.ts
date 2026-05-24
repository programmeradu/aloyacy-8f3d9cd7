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

/** Server-only helper used by the planner. Returns the number of
 *  "skipped-transfer" overrides recorded for an OD bucket in the last 30
 *  days. The planner adds N × 90 s of penalty to multi-ride itinerary
 *  scores when this is ≥ 3. */
export async function getSkippedTransferCount(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number> {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("trip_overrides")
    .select("id", { count: "exact", head: true })
    .eq("kind", "skipped-transfer")
    .gte("recorded_at", since)
    .eq("from_lat", round(from.lat))
    .eq("from_lng", round(from.lng))
    .eq("to_lat", round(to.lat))
    .eq("to_lng", round(to.lng));
  if (error) {
    console.warn("[overrides] count failed", error.message);
    return 0;
  }
  return count ?? 0;
}
