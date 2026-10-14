// Server-function auth middleware (name kept for the existing call sites).
//
// Verifies the Aloya session token — HttpOnly cookie on web, Bearer on
// mobile — and hands the handler a user-scoped D1 client: tables with a
// `user_id` column only see the caller's rows (the old RLS owner policies).
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { claimsFromRequest } from "@/lib/auth/session.server";
import { createUserScopedClient } from "@/lib/db";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: No request headers available");
  const claims = await claimsFromRequest(request);
  if (!claims) throw new Error("Unauthorized: Invalid or missing session");
  return next({
    context: {
      supabase: createUserScopedClient(claims.sub) as any,
      userId: claims.sub,
      claims,
    },
  });
});

export const requireAuth = requireSupabaseAuth;
