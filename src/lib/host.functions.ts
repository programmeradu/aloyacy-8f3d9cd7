import { createServerFn } from "@tanstack/react-start";
import { getHeaders } from "@tanstack/react-start/server";

/**
 * Host-based routing for a single project serving two domains:
 *   aloyacy.live          → marketing site
 *   app.aloyacy.live      → the app itself
 *
 * Anything else (Lovable preview URLs, *.lovable.app, localhost) is
 * treated as the app so devs see the real product by default.
 */
export function isMarketingHostname(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  if (h === "aloyacy.live" || h === "www.aloyacy.live") return true;
  return false;
}

export const getIsMarketingHost = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const h = getHeaders();
    const host =
      (h["x-forwarded-host"] as string | undefined) ||
      (h.host as string | undefined) ||
      "";
    return isMarketingHostname(host);
  } catch {
    return false;
  }
});
