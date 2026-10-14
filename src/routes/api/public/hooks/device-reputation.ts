// C2 — score each phone against arrival_truth. Cron-only.

import { createFileRoute } from "@tanstack/react-router";
import { rollupDeviceReputation } from "@/lib/device-reputation.server";
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
    const result = await rollupDeviceReputation();
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "reputation failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/hooks/device-reputation")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => await runFromRequest(request),
      POST: async ({ request }) => await runFromRequest(request),
    },
  },
});
