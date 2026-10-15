// Admin gating for server functions and for internal UI routes.
//
// The Worker entry (src/server.ts) already 404s non-admin requests to the
// internal paths themselves. That does not cover:
//   * server functions, which are reached through /_serverFn/<id> rather than
//     the page path, so the data behind an internal page needs its own gate;
//   * client-side navigation, which renders a route without a page request.
// `requireAdmin` closes the first; `assertAdminPage` (called from each internal
// route's beforeLoad) closes the second.
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { notFound } from "@tanstack/react-router";
import { isAdminRequest } from "@/lib/admin-auth.server";

export const requireAdmin = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const ok = await isAdminRequest(getRequest());
  if (!ok) {
    try {
      setResponseStatus(404);
    } catch {
      // No response context (unit tests); the throw below is what matters.
    }
    throw new Error("Not Found");
  }
  return next();
});

/** Server side: true only for an admin request. Never throws. */
export const checkAdminAccess = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return { admin: await isAdminRequest(getRequest()) };
  } catch {
    return { admin: false };
  }
});

/** For an internal route's `beforeLoad`: renders the 404 page for non-admins. */
export async function assertAdminPage(): Promise<void> {
  let admin = false;
  try {
    admin = (await checkAdminAccess()).admin;
  } catch {
    admin = false;
  }
  if (!admin) throw notFound();
}
