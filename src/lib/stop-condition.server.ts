// D1 write/read path. Consensus is pure; this is I/O around it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  REPORT_RATE_LIMIT_SEC,
  isStopAttribute,
  isStopAttributeValue,
  pickStopConsensus,
  type StopAttribute,
  type StopConsensus,
  type StopReport,
} from "@aloya/core/stop-condition";

const db = supabaseAdmin as unknown as SupabaseClient;

type AttrRow = {
  stop_id: string;
  attribute: string;
  value: string;
  n: number;
  source: string;
};

type ReportRow = {
  stop_id: string;
  device_id: string;
  attribute: string;
  value: string;
  reported_at: string;
};

function asConsensus(row: AttrRow): StopConsensus | null {
  if (!isStopAttribute(row.attribute)) return null;
  if (row.source !== "seed" && row.source !== "riders") return null;
  if (!isStopAttributeValue(row.attribute, row.value)) return null;
  return {
    stopId: row.stop_id,
    attribute: row.attribute,
    value: row.value,
    n: row.n,
    source: row.source,
  };
}

export async function loadStopCondition(stopId: string): Promise<StopConsensus[]> {
  const { data, error } = await db
    .from("stop_attributes")
    .select("stop_id, attribute, value, n, source")
    .eq("stop_id", stopId)
    .limit(20);
  if (error || !data) return [];
  return (data as AttrRow[]).map(asConsensus).filter((r): r is StopConsensus => r != null);
}

export async function reportStopCondition(input: {
  deviceId: string;
  stopId: string;
  attribute: StopAttribute;
  value: string;
}): Promise<{ ok: true; rows: StopConsensus[] } | { ok: false; status: number; error: string }> {
  if (!isStopAttributeValue(input.attribute, input.value)) {
    return { ok: false, status: 400, error: "Unknown value" };
  }
  const cutoff = new Date(Date.now() - REPORT_RATE_LIMIT_SEC * 1000).toISOString();
  const { data: recent } = await db
    .from("stop_reports")
    .select("id")
    .eq("device_id", input.deviceId)
    .eq("stop_id", input.stopId)
    .eq("attribute", input.attribute)
    .gte("reported_at", cutoff)
    .limit(1);
  if (recent && recent.length > 0) {
    return { ok: false, status: 429, error: "Try again in a minute" };
  }
  const { error: insertErr } = await db.from("stop_reports").insert({
    stop_id: input.stopId,
    device_id: input.deviceId,
    attribute: input.attribute,
    value: input.value,
  });
  if (insertErr) return { ok: false, status: 500, error: "Could not save" };
  await recomputeStopAttribute(input.stopId, input.attribute);
  return { ok: true, rows: await loadStopCondition(input.stopId) };
}

async function recomputeStopAttribute(stopId: string, attribute: StopAttribute): Promise<void> {
  const { data: reportRows } = await db
    .from("stop_reports")
    .select("stop_id, device_id, attribute, value, reported_at")
    .eq("stop_id", stopId)
    .eq("attribute", attribute)
    .order("reported_at", { ascending: true })
    .limit(500);
  const { data: existing } = await db
    .from("stop_attributes")
    .select("value, source")
    .eq("stop_id", stopId)
    .eq("attribute", attribute)
    .maybeSingle();
  const reports: StopReport[] = ((reportRows ?? []) as ReportRow[]).map((r) => ({
    stopId: r.stop_id,
    deviceId: r.device_id,
    attribute,
    value: r.value,
    reportedAt: Date.parse(r.reported_at) || 0,
  }));
  const previous =
    existing && (existing.source === "seed" || existing.source === "riders")
      ? { value: existing.value as string, source: existing.source as "seed" | "riders" }
      : null;
  const next = pickStopConsensus(reports, previous);
  if (!next) return;
  await db.from("stop_attributes").upsert({
    stop_id: stopId,
    attribute,
    value: next.value,
    n: next.n,
    source: next.source,
    updated_at: new Date().toISOString(),
  });
}
