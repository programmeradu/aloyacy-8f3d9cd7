// Session endpoint for web and mobile.
//   GET    -> current session or { session: null }
//   POST   -> current session, or a new anonymous device session
//   DELETE -> sign out (clears the cookie; mobile just drops its token)
// Mobile stores `session.access_token` and sends it as `Authorization: Bearer`.
import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie, resolveSession, sessionCookie } from "@/lib/auth/session.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
}

export const Route = createFileRoute("/api/public/auth/session")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const { session } = await resolveSession(request, false);
          return json({ session }, 200, session ? { "Set-Cookie": sessionCookie(session.access_token, request) } : {});
        } catch (e) {
          return json({ session: null, error: (e as Error).message }, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          const { session, created } = await resolveSession(request, true);
          return json({ session, created }, 200, { "Set-Cookie": sessionCookie(session!.access_token, request) });
        } catch (e) {
          return json({ session: null, error: (e as Error).message }, 500);
        }
      },
      DELETE: async () => json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() }),
    },
  },
});
