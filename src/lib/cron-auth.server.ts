// Auth for the scheduled hooks under /api/public/hooks/*, /api/public/snapshot,
// /api/public/trip-alerts and /lovable/email/queue/process.
//
// The only caller is the Worker's own scheduled() handler, which invokes the
// fetch handler in-process with `Authorization: Bearer ${CRON_SECRET}`.
// The Supabase anon key is no longer accepted (it was public by design, so it
// never really gated anything).
//
// Fails CLOSED: with CRON_SECRET unset every request is refused.

import { getWorkerEnv } from "@/lib/worker-env";

export function cronSecret(): string | undefined {
  const fromEnv = getWorkerEnv()?.["CRON_SECRET"];
  const v = typeof fromEnv === "string" && fromEnv ? fromEnv : process.env.CRON_SECRET;
  return v && v.length > 0 ? v : undefined;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only when CRON_SECRET is configured and the request presents it. */
export function isCronAuthorized(request: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const bearer = auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : null;
  const header = request.headers.get("x-cron-secret");
  for (const candidate of [bearer, header]) {
    if (candidate && safeEqual(candidate, secret)) return true;
  }
  return false;
}

/** 401 JSON response when the request is not an authorized cron call, else null. */
export function cronGuard(
  request: Request,
  headers: Record<string, string> = {},
): Response | null {
  if (isCronAuthorized(request)) return null;
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
