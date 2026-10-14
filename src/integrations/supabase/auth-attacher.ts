// Registered as a global functionMiddleware in src/start.ts. Same-origin
// serverFn calls already carry the HttpOnly session cookie; the bearer is
// attached too so non-cookie contexts (embedded webviews) keep working.
import { createMiddleware } from "@tanstack/react-start";
import { getAccessTokenSync } from "@/lib/auth/client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getAccessTokenSync();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
