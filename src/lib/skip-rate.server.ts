// D2 write/read. Classification is pure; this is I/O around it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow } from "@aloya/core/cy-time";
import {
  SKIP_WINDOW_DAYS,
  pickSkipRates,
  tallySkipVisits,
  type SkipOutcome,
  type SkipRate,
  type SkipVisitRow,
} from "@aloya/core/skip-rate";

const db = supabaseAdmin as unknown as SupabaseClient;

type VisitRow = {
  stop_id: string;
  route_id: string;
  outcome: string;
  classified_at: string;
  hour_of_day: number | null;
  day_of_week: number | null;
};

function missingTable(message: string | undefined): boolean {
  return /stop_skip_visits|does not exist|schema cache/i.test(message ?? "");
}

export async function recordSkipVisit(input: {
  stopId: string;
  routeId: string;
  tripId: string;
  outcome: SkipOutcome;
  dwellSec: number;
  classifiedAt: number;
}): Promise<void> {
  const { hour, dow } = cyHourDow(input.classifiedAt);
  const { error } = await db.from("stop_skip_visits").upsert(
    {
      stop_id: input.stopId,
      route_id: input.routeId,
      trip_id: input.tripId,
      outcome: input.outcome,
      dwell_sec: input.dwellSec,
      classified_at: new Date(input.classifiedAt).toISOString(),
      hour_of_day: hour,
      day_of_week: dow,
    },
    { onConflict: "trip_id,stop_id" },
  );
  if (error && !missingTable(error.message)) {
    /* fail closed — skip rate stays silent rather than breaking A2 */
  }
}

export async function loadSkipRates(stopId: string, nowMs = Date.now()): Promise<SkipRate[]> {
  const from = new Date(nowMs - SKIP_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("stop_skip_visits")
    .select("stop_id, route_id, outcome, classified_at, hour_of_day, day_of_week")
    .eq("stop_id", stopId)
    .gte("classified_at", from)
    .limit(4000);
  if (error || !data) return [];
  const rows: SkipVisitRow[] = [];
  for (const r of data as VisitRow[]) {
    if (r.outcome !== "served" && r.outcome !== "skipped") continue;
    rows.push({
      stopId: r.stop_id,
      routeId: r.route_id,
      outcome: r.outcome,
      classifiedAt: Date.parse(r.classified_at) || 0,
      hour: r.hour_of_day,
      dow: r.day_of_week,
    });
  }
  return pickSkipRates(tallySkipVisits(rows), stopId, nowMs);
}
