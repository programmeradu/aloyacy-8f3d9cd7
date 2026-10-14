// Verify an emailed sign-in code (replaces supabase.auth.verifyOtp).
// Body: { email, token }. Returns { ok, session } and sets the session cookie.
// A new email is attached to the caller's anonymous user (same user id).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { claimsFromRequest, sessionCookie, verifyOtp } from "@/lib/auth/session.server";

const BodySchema = z.object({
  email: z.string().email().max(254),
  token: z.string().regex(/^\d{6}$/),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
}

export const Route = createFileRoute("/api/public/auth/verify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return json({ ok: false, error: "Enter the 6-digit code." }, 400);
        }
        const current = await claimsFromRequest(request);
        const res = await verifyOtp(body.email, body.token, current?.sub ?? null);
        if (!res.ok) return json({ ok: false, error: res.error, code: res.code }, 400);
        return json({ ok: true, session: res.session, linked: res.linked }, 200, {
          "Set-Cookie": sessionCookie(res.session.access_token, request),
        });
      },
    },
  },
});
