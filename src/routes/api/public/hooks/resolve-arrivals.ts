// A2 — resolve actual arrivals. Vehicle-cross geofence first, inferred
// later-stop evidence second. Cron-only.

import { createFileRoute } from "@tanstack/react-router";
import { resolveArrivals } from "@/lib/resolve-arrivals.server";
import { isCronAuthorized } from "@/lib/cron-auth.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function guard(request: Request) {
  // Bearer CRON_SECRET only; refuses everything when the secret is unset.
  if (!isCronAuthorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);
  return null;
}

async function runFromRequest(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const { vehicle, inferred } = await resolveArrivals();
    return json({ ok: true, vehicle, inferred, resolved: vehicle + inferred });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "resolve failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/hooks/resolve-arrivals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => await runFromRequest(request),
      POST: async ({ request }) => await runFromRequest(request),
    },
  },
});
