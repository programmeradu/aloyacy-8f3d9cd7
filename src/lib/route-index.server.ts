// E2 I/O. A route page is rated only from delay_stats. Missing table fails closed.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { routeIndexable } from "@aloya/core/route-index";

const SITEMAP_CAP = 100;

function safeRouteId(id: unknown): string | null {
  return typeof id === "string" && /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}

export async function loadRouteSampleCount(routeId: string): Promise<number> {
  const id = safeRouteId(routeId);
  if (!id) return 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("delay_stats")
      .select("sample_count")
      .eq("route_id", id)
      .limit(2000);
    if (error || !data) return 0;
    let n = 0;
    for (const r of data as { sample_count: number }[]) n += Number(r.sample_count) || 0;
    return n;
  } catch {
    return 0;
  }
}

export async function listIndexableRouteIds(): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("delay_stats")
      .select("route_id, sample_count")
      .limit(5000);
    if (error || !data) return [];
    const nBy = new Map<string, number>();
    for (const r of data as { route_id: string; sample_count: number }[]) {
      const id = safeRouteId(r.route_id);
      if (!id) continue;
      nBy.set(id, (nBy.get(id) ?? 0) + (Number(r.sample_count) || 0));
    }
    return [...nBy.entries()]
      .filter(([, n]) => routeIndexable(n))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SITEMAP_CAP)
      .map(([id]) => id);
  } catch {
    return [];
  }
}
