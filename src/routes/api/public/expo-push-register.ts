import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const schema = z.object({
  deviceId: z.string().min(8).max(128),
  expoToken: z.string().min(10).max(256).regex(/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().max(32).optional(),
});

export const Route = createFileRoute("/api/public/expo-push-register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400, headers: CORS });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
            status: 400,
            headers: { ...CORS, "content-type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("expo_push_tokens")
          .upsert(
            {
              device_id: parsed.data.deviceId,
              expo_token: parsed.data.expoToken,
              platform: parsed.data.platform,
              app_version: parsed.data.appVersion ?? null,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "device_id" },
          );
        if (error) {
          console.error("[expo-push-register]", error);
          return new Response("Server error", { status: 500, headers: CORS });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
        });
      },
    },
  },
});
