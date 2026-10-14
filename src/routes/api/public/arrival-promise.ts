// Arrival promises for the native rider app.
//
// The web calls the server functions directly; Expo cannot, so this route
// exposes the same three actions behind a Supabase bearer token. Everything
// is scoped to the token's user — there is no unauthenticated path here.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@/lib/db/compat";
import { computePromisePlan, planSnapshot } from "@/lib/arrival-promise.server";
import { logger } from "@/lib/logger";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

/** arrival_promises is newer than the generated types. */
const db = supabaseAdmin as unknown as SupabaseClient;

const SELECT_COLS =
  "id, target_arrival_unix, margin_pref, origin_label, origin_lat, origin_lng, destination_label, destination_lat, destination_lng, plan_json, ladder_json, leave_by_unix, baseline_leave_by_unix, buffer_sec, reason_short, status, nudges_sent, last_replan_at, created_at";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function resolveUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    const supa = createClient(
      (process.env.CUSTOM_SUPABASE_URL || process.env.SUPABASE_URL)!,
      (import.meta.env.VITE_CUSTOM_SUPABASE_ANON_KEY ||
        process.env.CUSTOM_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY)!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

const point = z.object({
  label: z.string().min(1).max(160),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    targetArrivalUnix: z.number().int().positive(),
    margin: z.enum(["relaxed", "normal", "tight"]).default("normal"),
    origin: point,
    destination: point,
    expoDeviceId: z.string().min(4).max(128).optional(),
  }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
  z.object({ action: z.literal("refresh"), id: z.string().uuid() }),
  z.object({
    action: z.literal("adjust"),
    id: z.string().uuid(),
    targetArrivalUnix: z.number().int().positive(),
  }),
]);

const MAX_HORIZON_SEC = 8 * 24 * 3600;

export const Route = createFileRoute("/api/public/arrival-promise")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const userId = await resolveUserId(request);
        if (!userId) return json({ error: "Unauthorized" }, 401);
        const cutoff = Math.floor(Date.now() / 1000) - 3 * 3600;
        const { data, error } = await db
          .from("arrival_promises")
          .select(SELECT_COLS)
          .eq("user_id", userId)
          .in("status", ["watching", "leave-now", "missed"])
          .gte("target_arrival_unix", cutoff)
          .order("target_arrival_unix", { ascending: true })
          .limit(20);
        if (error) return json({ error: error.message }, 500);
        return json({ promises: data ?? [] });
      },

      POST: async ({ request }) => {
        const userId = await resolveUserId(request);
        if (!userId) return json({ error: "Unauthorized" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
        const input = parsed.data;

        if (input.action === "cancel") {
          const { error } = await db
            .from("arrival_promises")
            .update({ status: "cancelled" })
            .eq("id", input.id)
            .eq("user_id", userId);
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true });
        }

        if (input.action === "refresh" || input.action === "adjust") {
          const tsNow = Math.floor(Date.now() / 1000);
          if (input.action === "adjust") {
            if (input.targetArrivalUnix <= tsNow + 300) {
              return json({ error: "Pick an arrival time at least 5 minutes from now." }, 400);
            }
            if (input.targetArrivalUnix > tsNow + MAX_HORIZON_SEC) {
              return json({ error: "Aloya can watch a trip up to a week ahead." }, 400);
            }
          }
          const { data: row, error } = await db
            .from("arrival_promises")
            .select(SELECT_COLS)
            .eq("id", input.id)
            .eq("user_id", userId)
            .maybeSingle();
          if (error || !row) return json({ error: "Promise not found" }, 404);
          const p = row as unknown as Record<string, string | number>;
          const targetArrivalUnix =
            input.action === "adjust" ? input.targetArrivalUnix : Number(p.target_arrival_unix);
          const plan = await computePromisePlan({
            origin: {
              lat: Number(p.origin_lat),
              lng: Number(p.origin_lng),
              label: String(p.origin_label),
            },
            destination: {
              lat: Number(p.destination_lat),
              lng: Number(p.destination_lng),
              label: String(p.destination_label),
            },
            targetArrivalUnix,
            margin: String(p.margin_pref) as "relaxed" | "normal" | "tight",
          });
          const leaveBy = plan.leaveByUnix ?? Number(p.leave_by_unix);
          const { data: updated, error: upErr } = await db
            .from("arrival_promises")
            .update({
              ...(input.action === "adjust"
                ? {
                    target_arrival_unix: targetArrivalUnix,
                    baseline_leave_by_unix: leaveBy,
                    nudges_sent: [],
                  }
                : {}),
              plan_json: JSON.parse(JSON.stringify(planSnapshot(plan.itinerary))),
              ladder_json: JSON.parse(JSON.stringify(plan.ladder)),
              leave_by_unix: leaveBy,
              buffer_sec: plan.bufferSec,
              reason_short: plan.reasonShort,
              status: plan.unmakeable ? "missed" : "watching",
              last_replan_at: new Date().toISOString(),
            })
            .eq("id", input.id)
            .select(SELECT_COLS)
            .single();
          if (upErr) return json({ error: upErr.message }, 500);
          return json({ promise: updated });
        }

        const nowUnix = Math.floor(Date.now() / 1000);
        if (input.targetArrivalUnix <= nowUnix + 300) {
          return json({ error: "Pick an arrival time at least 5 minutes from now." }, 400);
        }
        if (input.targetArrivalUnix > nowUnix + MAX_HORIZON_SEC) {
          return json({ error: "Aloya can watch a trip up to a week ahead." }, 400);
        }

        try {
          const plan = await computePromisePlan({
            origin: input.origin,
            destination: input.destination,
            targetArrivalUnix: input.targetArrivalUnix,
            margin: input.margin,
          });
          const leaveBy = plan.leaveByUnix ?? input.targetArrivalUnix - 3600;
          const { data: row, error } = await db
            .from("arrival_promises")
            .insert({
              user_id: userId,
              target_arrival_unix: input.targetArrivalUnix,
              margin_pref: input.margin,
              origin_label: input.origin.label,
              origin_lat: input.origin.lat,
              origin_lng: input.origin.lng,
              destination_label: input.destination.label,
              destination_lat: input.destination.lat,
              destination_lng: input.destination.lng,
              plan_json: JSON.parse(JSON.stringify(planSnapshot(plan.itinerary))),
              ladder_json: JSON.parse(JSON.stringify(plan.ladder)),
              leave_by_unix: leaveBy,
              baseline_leave_by_unix: leaveBy,
              buffer_sec: plan.bufferSec,
              reason_short: plan.reasonShort,
              status: plan.unmakeable ? "missed" : "watching",
              expo_device_id: input.expoDeviceId ?? null,
              last_replan_at: new Date().toISOString(),
              replan_count: 1,
            })
            .select(SELECT_COLS)
            .single();
          if (error) return json({ error: error.message }, 500);
          return json({ promise: row });
        } catch (e) {
          logger.error("arrival-promise create failed", {
            error: e instanceof Error ? e.message : String(e),
          });
          return json({ error: "Could not start watching this arrival" }, 500);
        }
      },
    },
  },
});
