// Access control for Aloya's internal, admin, debug and ops surfaces.
//
// A request is an admin request when EITHER
//   * it carries `x-aloya-admin: <ADMIN_SECRET>`, or
//   * it carries a valid signed session (cookie or Bearer) for a non-anonymous
//     user whose email is listed in ADMIN_EMAILS (comma separated).
//
// Fails CLOSED: with neither ADMIN_SECRET nor ADMIN_EMAILS configured, nobody
// is an admin. Everyone else gets a plain 404 so the routes are not even
// advertised as existing.

import { getWorkerEnv } from "@/lib/worker-env";
import { claimsFromRequest } from "@/lib/auth/session.server";

export const ADMIN_HEADER = "x-aloya-admin";

/**
 * Path prefixes that are internal-only. Matched on whole path segments, so
 * `/admin` covers `/admin/seo` but not `/administrator`.
 */
export const ADMIN_PATH_PREFIXES = [
  "/admin",
  "/debug",
  "/internal",
  "/qa",
  "/metrics",
  "/api/public/metrics",
  "/api/public/bedrock-test",
] as const;

function envVar(name: string): string | undefined {
  const fromEnv = getWorkerEnv()?.[name];
  const v = typeof fromEnv === "string" && fromEnv ? fromEnv : process.env[name];
  const t = v?.trim();
  return t ? t : undefined;
}

export function adminSecret(): string | undefined {
  return envVar("ADMIN_SECRET");
}

export function adminEmails(): string[] {
  return (envVar("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `pathname` is one of the internal-only surfaces. */
export function isAdminPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return ADMIN_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** True only when an admin credential is configured AND presented. */
export async function isAdminRequest(request: Request | null | undefined): Promise<boolean> {
  if (!request) return false;
  const secret = adminSecret();
  const emails = adminEmails();
  if (!secret && emails.length === 0) return false;

  if (secret) {
    const header = request.headers.get(ADMIN_HEADER);
    if (header && safeEqual(header.trim(), secret)) return true;
  }

  if (emails.length > 0) {
    const claims = await claimsFromRequest(request);
    const email = claims?.email?.trim().toLowerCase();
    if (claims && !claims.is_anonymous && email && emails.includes(email)) return true;
  }
  return false;
}

export function adminNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

/**
 * Worker-level gate. Returns a 404 for a non-admin request to an internal
 * path, otherwise null (let the request through). The metrics endpoints
 * also keep accepting their machine credential (Bearer METRICS_TOKEN).
 */
export async function adminGate(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!isAdminPath(pathname)) return null;
  if (request.method === "OPTIONS") return adminNotFound();
  if (isMetricsScrape(pathname, request)) return null;
  if (await isAdminRequest(request)) return null;
  return adminNotFound();
}

/** Prometheus scrapers may keep using `Authorization: Bearer <METRICS_TOKEN>`. */
function isMetricsScrape(pathname: string, request: Request): boolean {
  if (pathname !== "/metrics" && pathname !== "/api/public/metrics") return false;
  const token = envVar("METRICS_TOKEN");
  if (!token) return false;
  const auth = request.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${token}`);
}
