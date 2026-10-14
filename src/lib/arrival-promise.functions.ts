// Rider-facing CRUD for arrival promises ("get me to Larnaca by 16:00").
//
// Creating a promise immediately plans it once so the rider sees a real
// departure ladder rather than an empty card waiting on the next cron tick.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@/lib/db/compat";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LadderRung, MarginPref, PromiseStatus } from "@aloya/core/arrival-promise";

const pointSchema = z.object({
  label: z.string().min(1).max(160),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const createSchema = z.object({
  targetArrivalUnix: z.number().int().positive(),
  margin: z.enum(["relaxed", "normal", "tight"]).default("normal"),
  origin: pointSchema,
  destination: pointSchema,
  /** Browser device id — we resolve its saved web-push subscription server-side. */
  deviceId: z.string().min(4).max(128).optional(),
  /** Native device id, when the promise is made from the Expo app. */
  expoDeviceId: z.string().min(4).max(128).optional(),
});

export type PromiseLegSummary =
  | {
      kind: "ride";
      routeId: string;
      routeShort: string;
      boardName: string;
      boardUnix: number;
      alightName: string;
      alightUnix: number;
      live: boolean;
    }
  | { kind: "walk"; durationSec: number; distanceMeters: number; toName: string }
  | { kind: "wait"; durationSec: number; name: string };

export type PromisePlanSnapshot = {
  itineraryId?: string;
  departureUnix?: number;
  arrivalUnix?: number;
  transfers?: number;
  source?: string;
  legs?: PromiseLegSummary[];
};

export type ArrivalPromiseRow = {
  id: string;
  target_arrival_unix: number;
  margin_pref: MarginPref;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  plan_json: PromisePlanSnapshot;
  ladder_json: LadderRung[];
  leave_by_unix: number;
  baseline_leave_by_unix: number;
  buffer_sec: number;
  reason_short: string | null;
  status: PromiseStatus;
  nudges_sent: string[];
  last_replan_at: string | null;
  created_at: string;
};

const SELECT_COLS =
  "id, target_arrival_unix, margin_pref, origin_label, origin_lat, origin_lng, destination_label, destination_lat, destination_lng, plan_json, ladder_json, leave_by_unix, baseline_leave_by_unix, buffer_sec, reason_short, status, nudges_sent, last_replan_at, created_at";

/** The table is newer than the generated types, so query it untyped. */
function loose(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

const MAX_HORIZON_SEC = 8 * 24 * 3600;

export const createArrivalPromise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    if (data.targetArrivalUnix <= nowUnix + 300) {
      throw new Error("Pick an arrival time at least 5 minutes from now.");
    }
    if (data.targetArrivalUnix > nowUnix + MAX_HORIZON_SEC) {
      throw new Error("Aloya can watch a trip up to a week ahead.");
    }

    const { computePromisePlan, planSnapshot } = await import("@/lib/arrival-promise.server");
    const plan = await computePromisePlan({
      origin: data.origin,
      destination: data.destination,
      targetArrivalUnix: data.targetArrivalUnix,
      margin: data.margin,
    });

    // With no plannable option yet (sparse rural service, feed hiccup) we still
    // create the promise and let the watcher keep trying — but we anchor the
    // leave time on the target so the countdown is never nonsense.
    const leaveBy = plan.leaveByUnix ?? data.targetArrivalUnix - 3600;

    // Resolve the rider's most recent web-push subscription so the watcher has
    // somewhere to send nudges without the client having to know row ids.
    let pushSubscriptionId: string | null = null;
    if (data.deviceId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: sub } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id")
        .eq("device_id", data.deviceId)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      pushSubscriptionId = sub?.id ?? null;
    }

    const db = loose(context.supabase);
    const { data: row, error } = await db
      .from("arrival_promises")
      .insert({
        user_id: context.userId,
        target_arrival_unix: data.targetArrivalUnix,
        margin_pref: data.margin,
        origin_label: data.origin.label,
        origin_lat: data.origin.lat,
        origin_lng: data.origin.lng,
        destination_label: data.destination.label,
        destination_lat: data.destination.lat,
        destination_lng: data.destination.lng,
        plan_json: JSON.parse(JSON.stringify(planSnapshot(plan.itinerary))),
        ladder_json: JSON.parse(JSON.stringify(plan.ladder)),
        leave_by_unix: leaveBy,
        baseline_leave_by_unix: leaveBy,
        buffer_sec: plan.bufferSec,
        reason_short: plan.reasonShort,
        status: plan.unmakeable ? "missed" : "watching",
        push_subscription_id: pushSubscriptionId,
        expo_device_id: data.expoDeviceId ?? null,
        last_replan_at: new Date().toISOString(),
        replan_count: 1,
      })
      .select(SELECT_COLS)
      .single();

    if (error) throw new Error(error.message);
    return row as unknown as ArrivalPromiseRow;
  });

export const listArrivalPromises = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: unknown) => z.void().optional().parse(input))
  .handler(async ({ context }) => {
    const cutoff = Math.floor(Date.now() / 1000) - 3 * 3600;
    const db = loose(context.supabase);
    const { data, error } = await db
      .from("arrival_promises")
      .select(SELECT_COLS)
      .in("status", ["watching", "leave-now", "missed"])
      .gte("target_arrival_unix", cutoff)
      .order("target_arrival_unix", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ArrivalPromiseRow[];
  });

const idSchema = z.object({ id: z.string().uuid() });

export const cancelArrivalPromise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { error } = await db
      .from("arrival_promises")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** On-demand re-plan when the rider opens the card and wants the truth now. */
export const refreshArrivalPromise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: row, error } = await db
      .from("arrival_promises")
      .select(SELECT_COLS)
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Promise not found");
    const promise = row as unknown as ArrivalPromiseRow;

    const { computePromisePlan, planSnapshot } = await import("@/lib/arrival-promise.server");
    const plan = await computePromisePlan({
      origin: {
        lat: promise.origin_lat,
        lng: promise.origin_lng,
        label: promise.origin_label,
      },
      destination: {
        lat: promise.destination_lat,
        lng: promise.destination_lng,
        label: promise.destination_label,
      },
      targetArrivalUnix: promise.target_arrival_unix,
      margin: promise.margin_pref,
    });

    const { data: updated, error: upErr } = await db
      .from("arrival_promises")
      .update({
        plan_json: JSON.parse(JSON.stringify(planSnapshot(plan.itinerary))),
        ladder_json: JSON.parse(JSON.stringify(plan.ladder)),
        leave_by_unix: plan.leaveByUnix ?? promise.leave_by_unix,
        buffer_sec: plan.bufferSec,
        reason_short: plan.reasonShort,
        status: plan.unmakeable
          ? "missed"
          : promise.status === "missed"
            ? "watching"
            : promise.status,
        last_replan_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select(SELECT_COLS)
      .single();
    if (upErr) throw new Error(upErr.message);
    return updated as unknown as ArrivalPromiseRow;
  });

const adjustSchema = z.object({
  id: z.string().uuid(),
  targetArrivalUnix: z.number().int().positive(),
});

/**
 * Give the promise more room: move the target arrival later and re-plan
 * against it. Nudges already sent are cleared so the escalation ladder
 * restarts against the new time rather than staying silent.
 */
export const adjustArrivalPromise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => adjustSchema.parse(input))
  .handler(async ({ data, context }) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    if (data.targetArrivalUnix <= nowUnix + 300) {
      throw new Error("Pick an arrival time at least 5 minutes from now.");
    }
    if (data.targetArrivalUnix > nowUnix + MAX_HORIZON_SEC) {
      throw new Error("Aloya can watch a trip up to a week ahead.");
    }

    const db = loose(context.supabase);
    const { data: row, error } = await db
      .from("arrival_promises")
      .select(SELECT_COLS)
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Promise not found");
    const promise = row as unknown as ArrivalPromiseRow;

    const { computePromisePlan, planSnapshot } = await import("@/lib/arrival-promise.server");
    const plan = await computePromisePlan({
      origin: { lat: promise.origin_lat, lng: promise.origin_lng, label: promise.origin_label },
      destination: {
        lat: promise.destination_lat,
        lng: promise.destination_lng,
        label: promise.destination_label,
      },
      targetArrivalUnix: data.targetArrivalUnix,
      margin: promise.margin_pref,
    });

    const leaveBy = plan.leaveByUnix ?? data.targetArrivalUnix - 3600;
    const { data: updated, error: upErr } = await db
      .from("arrival_promises")
      .update({
        target_arrival_unix: data.targetArrivalUnix,
        plan_json: JSON.parse(JSON.stringify(planSnapshot(plan.itinerary))),
        ladder_json: JSON.parse(JSON.stringify(plan.ladder)),
        leave_by_unix: leaveBy,
        baseline_leave_by_unix: leaveBy,
        buffer_sec: plan.bufferSec,
        reason_short: plan.reasonShort,
        status: plan.unmakeable ? "missed" : "watching",
        nudges_sent: [],
        last_replan_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select(SELECT_COLS)
      .single();
    if (upErr) throw new Error(upErr.message);
    return updated as unknown as ArrivalPromiseRow;
  });
