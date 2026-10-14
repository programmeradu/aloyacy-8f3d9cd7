// Group trip page payload for the mobile app (it used to call the
// get_trip_group_view RPC through supabase-js). Same JSON as the RPC:
// the group, its members, `me_id` when memberToken matches, `expired`.
//
//   GET ?code=ABC123&memberToken=...   -> view | null

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const Query = z.object({
  code: z.string().min(4).max(16).regex(/^[A-Za-z0-9]+$/),
  memberToken: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/public/trip-group-view")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;
        const q = Query.safeParse({
          code: sp.get("code") ?? "",
          memberToken: sp.get("memberToken") || undefined,
        });
        if (!q.success) return new Response(JSON.stringify({ error: "invalid_code" }), { status: 400, headers: CORS });
        const { data, error } = await supabaseAdmin.rpc("get_trip_group_view", {
          p_code: q.data.code.toUpperCase(),
          p_member_token: q.data.memberToken ?? null,
        });
        if (error) return new Response(JSON.stringify({ error: "lookup_failed" }), { status: 500, headers: CORS });
        return new Response(JSON.stringify(data ?? null), { status: 200, headers: CORS });
      },
    },
  },
});
