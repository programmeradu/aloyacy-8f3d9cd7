// D2 rider skip report. Tally is pure; this is I/O around it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  SKIP_REPORT_RATE_LIMIT_SEC,
  SKIP_REPORT_WINDOW_DAYS,
  tallySkipReports,
  type SkipReportRow,
  type SkipReportTally,
} from "@aloya/core/skip-report";

const db = supabaseAdmin as unknown as SupabaseClient;

type ReportRow = {
  stop_id: string;
  device_id: string;
  reported_at: string;
};

function missingTable(message: string | undefined): boolean {
  return /stop_skip_reports|does not exist|schema cache/i.test(message ?? "");
}

async function loadRows(stopId: string, nowMs: number): Promise<SkipReportRow[]> {
  const from = new Date(nowMs - SKIP_REPORT_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("stop_skip_reports")
    .select("stop_id, device_id, reported_at")
    .eq("stop_id", stopId)
    .gte("reported_at", from)
    .limit(500);
  if (error || !data) return [];
  const rows: SkipReportRow[] = [];
  for (const r of data as ReportRow[]) {
    if (!r.device_id) continue;
    rows.push({
      stopId: r.stop_id,
      deviceId: r.device_id,
      reportedAt: Date.parse(r.reported_at) || 0,
    });
  }
  return rows;
}

export async function loadSkipReport(
  stopId: string,
  deviceId: string | undefined,
  nowMs = Date.now(),
): Promise<SkipReportTally> {
  const rows = await loadRows(stopId, nowMs);
  return tallySkipReports(rows, deviceId ?? null);
}

export async function reportSkip(
  input: { stopId: string; deviceId: string; routeId?: string },
  nowMs = Date.now(),
): Promise<{ ok: true; tally: SkipReportTally } | { ok: false; status: number; error: string }> {
  const cutoff = new Date(nowMs - SKIP_REPORT_RATE_LIMIT_SEC * 1000).toISOString();
  const { data: recent } = await db
    .from("stop_skip_reports")
    .select("id")
    .eq("device_id", input.deviceId)
    .eq("stop_id", input.stopId)
    .gte("reported_at", cutoff)
    .limit(1);
  if (recent && recent.length > 0) {
    return { ok: false, status: 429, error: "Try again in a minute" };
  }
  const { error } = await db.from("stop_skip_reports").insert({
    stop_id: input.stopId,
    route_id: input.routeId ?? null,
    device_id: input.deviceId,
    reported_at: new Date(nowMs).toISOString(),
  });
  if (error) {
    if (missingTable(error.message)) {
      return { ok: false, status: 503, error: "Not ready" };
    }
    return { ok: false, status: 400, error: "Could not record" };
  }
  return { ok: true, tally: await loadSkipReport(input.stopId, input.deviceId, nowMs) };
}
