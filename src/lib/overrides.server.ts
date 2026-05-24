// Server-only helpers for the override learning loop. Kept in a *.server.ts
// file so client bundles can't pull in `supabaseAdmin` via the functions
// module.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Number of "skipped-transfer" overrides recorded for an OD bucket
 *  (rounded to ~110 m) in the last 30 days. Used by the planner to demote
 *  multi-ride suggestions that riders keep walking past. */
export async function getSkippedTransferCount(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number> {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("trip_overrides")
    .select("id", { count: "exact", head: true })
    .eq("kind", "skipped-transfer")
    .gte("recorded_at", since)
    .eq("from_lat", round(from.lat))
    .eq("from_lng", round(from.lng))
    .eq("to_lat", round(to.lat))
    .eq("to_lng", round(to.lng));
  if (error) {
    console.warn("[overrides] count failed", error.message);
    return 0;
  }
  return count ?? 0;
}
