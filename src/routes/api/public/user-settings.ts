// The rider's own synced settings for the mobile app (it used to read and
// upsert `user_settings` straight through supabase-js). Only the columns the
// app roams across devices are exposed: `locale` and `accessibility_prefs`.
//
//   GET                                   -> { settings: { locale, accessibility_prefs } | null }
//   POST { locale?, accessibility_prefs? } -> { ok: true }
//
// Auth: the Aloya session token (guest or email) as `Authorization: Bearer`.
// The token decides whose row is touched; there is no user id in the body.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { claimsFromRequest } from "@/lib/auth/session.server";
import { createUserScopedClient } from "@/lib/db";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

const AccessibilityPrefs = z
  .object({
    stepFree: z.boolean().optional(),
    preferShade: z.boolean().optional(),
    lowFloor: z.boolean().optional(),
    maxWalkMeters: z.number().int().min(100).max(3000).nullable().optional(),
  })
  .strict();

const Patch = z
  .object({
    locale: z.enum(["en", "el"]).optional(),
    accessibility_prefs: AccessibilityPrefs.optional(),
  })
  .strict()
  .refine((p) => p.locale !== undefined || p.accessibility_prefs !== undefined, {
    message: "nothing to save",
  });

export const Route = createFileRoute("/api/public/user-settings")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const claims = await claimsFromRequest(request);
        if (!claims) return json(401, { error: "unauthorized" });
        const db = createUserScopedClient(claims.sub);
        const { data, error } = await db
          .from("user_settings")
          .select("locale, accessibility_prefs")
          .maybeSingle();
        if (error) return json(500, { error: "lookup_failed" });
        return json(200, { settings: data ?? null });
      },
      POST: async ({ request }) => {
        const claims = await claimsFromRequest(request);
        if (!claims) return json(401, { error: "unauthorized" });
        const raw = await request.json().catch(() => undefined);
        const parsed = Patch.safeParse(raw);
        if (!parsed.success) return json(400, { error: "invalid_body" });
        const db = createUserScopedClient(claims.sub);
        const { error } = await db
          .from("user_settings")
          .upsert(
            { ...parsed.data, user_id: claims.sub, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        if (error) return json(500, { error: "save_failed" });
        return json(200, { ok: true });
      },
    },
  },
});
