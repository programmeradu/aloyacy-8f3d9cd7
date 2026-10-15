// The rider's top learned commute for right now, for the mobile home card
// (it used to query `commute_patterns` through supabase-js). Same scoring as
// the web server function: see topCommuteFor in commute-learner.functions.
//
//   GET ?tzOffset=<minutes, as Date#getTimezoneOffset>  -> { suggestion | null }
//
// Auth: the Aloya session token as `Authorization: Bearer`. Patterns are
// bucketed in the rider's local time, so the device sends its offset; the
// Worker clock is UTC. Without it we assume Cyprus time.

import { createFileRoute } from "@tanstack/react-router";
import { claimsFromRequest } from "@/lib/auth/session.server";
import { createUserScopedClient } from "@/lib/db";
import { topCommuteFor } from "@/lib/commute-learner.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

/** Offset in minutes from Date#getTimezoneOffset (UTC - local), else Cyprus. */
function offsetFrom(raw: string | null, at: Date): number {
  const n = raw === null ? NaN : Number(raw);
  if (Number.isInteger(n) && n >= -14 * 60 && n <= 14 * 60) return n;
  const local = new Date(at.toLocaleString("en-US", { timeZone: "Asia/Nicosia" }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((utc.getTime() - local.getTime()) / 60_000);
}

/**
 * A Date whose local getters (getDay/getHours/getMinutes) read the rider's
 * wall clock, so the shared scorer buckets exactly as the device would.
 */
export function riderClock(at: Date, tzOffsetMin: number): Date {
  const wall = new Date(at.getTime() - tzOffsetMin * 60_000);
  return new Date(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
  );
}

export const Route = createFileRoute("/api/public/commute-suggestion")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const claims = await claimsFromRequest(request);
        if (!claims) return json(401, { error: "unauthorized" });
        const now = new Date();
        const offset = offsetFrom(new URL(request.url).searchParams.get("tzOffset"), now);
        try {
          const db = createUserScopedClient(claims.sub);
          const out = await topCommuteFor(db, claims.sub, riderClock(now, offset));
          return json(200, out);
        } catch {
          return json(500, { error: "lookup_failed" });
        }
      },
    },
  },
});
