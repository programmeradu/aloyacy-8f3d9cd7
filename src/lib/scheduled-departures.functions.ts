// Server functions for "leave on time" reminders. A user schedules a trip
// for later and we promise to ping them ~15 min and ~5 min before the
// suggested departure (with conditions worsening => earlier).
//
// Authenticated CRUD: scoped to auth.uid() via requireSupabaseAuth.
// The cron-driven tick endpoint lives at /api/public/hooks/departure-tick.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planLegSchema = z.object({
  kind: z.string().min(1).max(32),
  routeId: z.string().max(64).optional(),
  routeShort: z.string().max(16).optional(),
  board: z.unknown().optional(),
  alight: z.unknown().optional(),
  from: z.unknown().optional(),
  to: z.unknown().optional(),
  durationSec: z.number().int().min(0).max(86_400).optional(),
}).passthrough();

const planSchema = z.object({
  fromLabel: z.string().min(1).max(160),
  toLabel: z.string().min(1).max(160),
  fromLat: z.number(),
  fromLng: z.number(),
  toLat: z.number(),
  toLng: z.number(),
  legs: z.array(planLegSchema).min(1).max(10),
  leaveByUnix: z.number().int().min(0),
}).passthrough();

const scheduleSchema = z.object({
  arriveByUnix: z.number().int().min(0),
  remindAtUnix: z.number().int().min(0),
  pushSubscriptionId: z.string().uuid().optional(),
  plan: planSchema,
});

export const scheduleDeparture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => scheduleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("scheduled_departures")
      .insert({
        user_id: userId,
        arrive_by_unix: data.arriveByUnix,
        remind_at_unix: data.remindAtUnix,
        push_subscription_id: data.pushSubscriptionId ?? null,
        plan_json: data.plan,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
  });

export const listScheduledDepartures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("scheduled_departures")
      .select("id, arrive_by_unix, remind_at_unix, plan_json, status, notified_at, created_at")
      .in("status", ["scheduled", "notified"])
      .order("arrive_by_unix", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const cancelSchema = z.object({ id: z.string().uuid() });

export const cancelScheduledDeparture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("scheduled_departures")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
