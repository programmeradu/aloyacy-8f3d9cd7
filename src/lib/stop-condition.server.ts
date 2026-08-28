// D1 write/read path. Consensus is pure; this is I/O around it.
// GET recomputes so a 90-day-old shelter claim does not linger.

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

type Previous = { value: string; source: "seed" | "riders"; n: number };

export async function loadStopCondition(
  stopId: string,
  nowMs = Date.now(),
): Promise<StopConsensus[]> {
  return reconcileStopCondition(stopId, nowMs);
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
  return { ok: true, rows: await reconcileStopCondition(input.stopId, Date.now()) };
}

async function reconcileStopCondition(stopId: string, nowMs: number): Promise<StopConsensus[]> {
  const { data: attrRows, error: attrErr } = await db
    .from("stop_attributes")
    .select("stop_id, attribute, value, n, source")
    .eq("stop_id", stopId)
    .limit(20);
  if (attrErr) return [];
  const { data: reportRows } = await db
    .from("stop_reports")
    .select("stop_id, device_id, attribute, value, reported_at")
    .eq("stop_id", stopId)
    .order("reported_at", { ascending: true })
    .limit(2000);

  const previousBy = new Map<StopAttribute, Previous>();
  for (const row of (attrRows ?? []) as AttrRow[]) {
    if (!isStopAttribute(row.attribute)) continue;
    if (row.source !== "seed" && row.source !== "riders") continue;
    if (!isStopAttributeValue(row.attribute, row.value)) continue;
    previousBy.set(row.attribute, { value: row.value, source: row.source, n: row.n });
  }

  const reportsBy = new Map<StopAttribute, StopReport[]>();
  for (const r of (reportRows ?? []) as ReportRow[]) {
    if (!isStopAttribute(r.attribute)) continue;
    const list = reportsBy.get(r.attribute) ?? [];
    list.push({
      stopId: r.stop_id,
      deviceId: r.device_id,
      attribute: r.attribute,
      value: r.value,
      reportedAt: Date.parse(r.reported_at) || 0,
    });
    reportsBy.set(r.attribute, list);
  }

  const attrs = new Set<StopAttribute>([...previousBy.keys(), ...reportsBy.keys()]);
  const out: StopConsensus[] = [];
  for (const attr of attrs) {
    const previous = previousBy.get(attr) ?? null;
    const next = pickStopConsensus(
      reportsBy.get(attr) ?? [],
      previous ? { value: previous.value, source: previous.source } : null,
      nowMs,
    );
    if (!next) {
      if (previous?.source === "riders") {
        await db.from("stop_attributes").delete().eq("stop_id", stopId).eq("attribute", attr);
      }
      continue;
    }
    out.push({ stopId, attribute: attr, ...next });
    if (
      !previous ||
      previous.value !== next.value ||
      previous.source !== next.source ||
      previous.n !== next.n
    ) {
      await db.from("stop_attributes").upsert({
        stop_id: stopId,
        attribute: attr,
        value: next.value,
        n: next.n,
        source: next.source,
        updated_at: new Date(nowMs).toISOString(),
      });
    }
  }
  return out;
}
