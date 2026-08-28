// D5 I/O. Whether a stop page has real content. Missing tables fail closed.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STOP_INDEX_RATED_MIN, type StopIndexFacts } from "@aloya/core/stop-index";
import { loadStopCondition } from "@/lib/stop-condition.server";
import { loadSkipRates } from "@/lib/skip-rate.server";

const SITEMAP_CAP = 400;

function safeStopId(id: unknown): string | null {
  return typeof id === "string" && /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}

async function ratedReliability(stopId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("delay_stats")
    .select("sample_count")
    .eq("stop_id", stopId)
    .limit(500);
  if (error || !data) return false;
  let n = 0;
  for (const r of data as { sample_count: number }[]) n += Number(r.sample_count) || 0;
  return n >= STOP_INDEX_RATED_MIN;
}

export async function loadStopIndexFacts(stopId: string): Promise<StopIndexFacts> {
  try {
    const [condition, skips, rated] = await Promise.all([
      loadStopCondition(stopId).catch(() => []),
      loadSkipRates(stopId).catch(() => []),
      ratedReliability(stopId).catch(() => false),
    ]);
    return {
      confirmedAttribute: condition.some((r) => r.n >= 1),
      skipSpeaks: skips.length > 0,
      ratedReliability: rated,
    };
  } catch {
    return { ratedReliability: false, skipSpeaks: false, confirmedAttribute: false };
  }
}

export async function listIndexableStopIds(): Promise<string[]> {
  try {
    const ids = new Set<string>();
    // stop_attributes exists in production but is missing from generated types.
    const { data: attrs } = (await (
      supabaseAdmin.from as unknown as (t: string) => {
        select: (cols: string) => { limit: (n: number) => PromiseLike<unknown> };
      }
    )("stop_attributes")
      .select("stop_id")
      .limit(SITEMAP_CAP)) as { data: { stop_id: string | null }[] | null };
    for (const r of attrs ?? []) {
      const id = safeStopId(r.stop_id);
      if (id) ids.add(id);
    }
    if (ids.size >= SITEMAP_CAP) return [...ids].sort().slice(0, SITEMAP_CAP);
    const { data: stats } = await supabaseAdmin
      .from("delay_stats")
      .select("stop_id, sample_count")
      .limit(2000);
    const samples = new Map<string, number>();
    for (const r of stats ?? []) {
      const id = safeStopId(r.stop_id);
      if (!id) continue;
      samples.set(id, (samples.get(id) ?? 0) + (Number(r.sample_count) || 0));
    }
    for (const [id, n] of samples) {
      if (n >= STOP_INDEX_RATED_MIN) ids.add(id);
    }
    return [...ids].sort().slice(0, SITEMAP_CAP);
  } catch {
    return [];
  }
}
