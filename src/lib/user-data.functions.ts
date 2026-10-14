// Server functions for the rider's own cloud data (formerly browser-side
// supabase-js queries guarded by RLS). The session decides whose rows these
// touch; any userId the client still passes is ignored.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SETTINGS_COLS = [
  "locale",
  "notif_trip_alerts",
  "notif_disruptions",
  "onboarded_at",
  "consent_analytics",
  "consent_cookies_at",
  "accessibility_prefs",
] as const;

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("user_settings").select("*").maybeSingle();
    if (error) return { ok: false as const, error: error.message as string, settings: null };
    return { ok: true as const, settings: (data ?? null) as Record<string, unknown> | null };
  });

export const saveUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ patch: z.record(z.string(), z.unknown()) }).parse)
  .handler(async ({ data, context }) => {
    const row: Record<string, unknown> = {};
    for (const k of SETTINGS_COLS) if (k in data.patch) row[k] = data.patch[k];
    if (!Object.keys(row).length) return { ok: true as const };
    const { error } = await context.supabase
      .from("user_settings")
      .upsert({ ...row, user_id: context.userId }, { onConflict: "user_id" });
    return error ? { ok: false as const, error: error.message as string } : { ok: true as const };
  });

export const getMotionCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("motion_card").select("*").maybeSingle();
    return { row: (data ?? null) as Record<string, any> | null };
  });

const MotionRowSchema = z
  .object({
    card_number: z.string().min(6).max(32),
    holder: z.string().max(200).nullable().optional(),
    tier: z.string().max(80).nullable().optional(),
    valid_until: z.string().max(40).nullable().optional(),
    card_type: z.string().max(80).nullable().optional(),
    balance_eur: z.number().nullable().optional(),
    balance_updated_at: z.string().nullable().optional(),
    last_sync_at: z.string().nullable().optional(),
    pass_name: z.string().max(200).nullable().optional(),
    jcc_email: z.string().max(254).nullable().optional(),
    jcc_display_name: z.string().max(200).nullable().optional(),
    jcc_linked_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export const saveMotionCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ row: MotionRowSchema }).parse)
  .handler(async ({ data, context }) => {
    const allowed = Object.keys(MotionRowSchema.shape);
    const row: Record<string, unknown> = {};
    for (const k of allowed) if (k in data.row) row[k] = (data.row as Record<string, unknown>)[k];
    const { error } = await context.supabase
      .from("motion_card")
      .upsert({ ...row, user_id: context.userId }, { onConflict: "user_id" });
    return error ? { ok: false as const, error: error.message as string } : { ok: true as const };
  });

export const listSavedPlacesCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("saved_places").select("*");
    return { rows: (error ? null : data) as Array<Record<string, any>> | null };
  });

const PlaceSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["home", "work", "custom"]),
  label: z.string().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(500).nullable().optional(),
});

export const upsertSavedPlacesCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ rows: z.array(PlaceSchema).max(200) }).parse)
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    // home/work are unique per user; custom rows are keyed by id.
    for (const r of data.rows) {
      const row: Record<string, unknown> = { ...r, user_id: context.userId };
      if (r.kind === "custom" && r.id) {
        // Only update ids this user owns; never upsert over someone else's row.
        const { data: mine } = await db.from("saved_places").select("id").eq("id", r.id).maybeSingle();
        if (!mine) delete row.id;
      }
      const { error } =
        r.kind === "custom"
          ? await db.from("saved_places").upsert(row, { onConflict: "id" })
          : await db.from("saved_places").upsert(row, { onConflict: "user_id,kind" });
      if (error) return { ok: false as const, error: error.message as string };
    }
    return { ok: true as const };
  });
