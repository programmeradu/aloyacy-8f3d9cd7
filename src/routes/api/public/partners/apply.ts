// Partner waitlist. Marketing (aloya.cy/partners) posts here. This is not
// a console, not keys, not usage — those wait for a paying Truth API customer.

import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PartnerApplySchema } from "@/lib/schemas/public-api";

const db = supabaseAdmin as unknown as SupabaseClient;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/partners/apply")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = PartnerApplySchema.parse(await request.json());
        } catch {
          return json(400, { error: "Invalid payload" });
        }
        if (parsed.company) return json(200, { ok: true });

        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: recent } = await db
          .from("partner_applications")
          .select("id")
          .ilike("email", parsed.email)
          .gte("created_at", since)
          .limit(1);
        if (recent && recent.length > 0) {
          return json(200, { ok: true, dedup: true });
        }

        const { error } = await db.from("partner_applications").insert({
          org_name: parsed.orgName,
          contact_name: parsed.contactName,
          email: parsed.email.toLowerCase(),
          role: parsed.role,
          use_case: parsed.useCase,
          website: parsed.website || null,
          source: "aloya.cy/partners",
        });
        if (error) return json(500, { error: "insert failed" });
        return json(200, { ok: true });
      },
    },
  },
});
