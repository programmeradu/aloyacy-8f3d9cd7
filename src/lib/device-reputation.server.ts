// C2 I/O. Scoring is pure; this loads arrival_truth + rider GPS and
// writes device_reputation. Missing table fails open — nobody carries.

import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  REP_WINDOW_DAYS,
  canCarryAlone,
  errorsByDevice,
  scoreDeviceReputation,
  type ReputationFix,
  type ReputationTruth,
} from "@aloya/core/device-reputation";
import { RIDER_PHYSICS_FOLD_MIN } from "@aloya/core/rider-physics";
import { trainBudget } from "@/lib/db/bulk";
import { getRoute, getStop } from "@/lib/gtfs";

const db = supabaseAdmin as unknown as SupabaseClient;
const PAGE = 1000;
const MAX_TRUTH = 8_000;
const MAX_FIXES = 20_000;

function missingTable(message: string | undefined): boolean {
  return /device_reputation|does not exist|schema cache/i.test(message ?? "");
}

function stopOf(stopId: string, routeId: string) {
  const agency = getRoute(routeId)?.agency;
  const s = getStop(stopId, agency);
  if (!s) return null;
  return { lat: s.lat, lng: s.lng };
}

export async function loadCanCarryDevices(deviceIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(deviceIds.filter((id) => id.length > 0))].slice(0, 200);
  if (ids.length === 0) return new Set();
  const { data, error } = await db
    .from("device_reputation")
    .select("device_id, score, n")
    .in("device_id", ids)
    .limit(200);
  if (error || !data) return new Set();
  const out = new Set<string>();
  for (const r of data as { device_id: string; score: number; n: number }[]) {
    if (canCarryAlone(r.score, r.n)) out.add(r.device_id);
  }
  return out;
}

export async function rollupDeviceReputation(nowMs = Date.now()): Promise<{ devices: number }> {
  const since = new Date(nowMs - REP_WINDOW_DAYS * 86_400_000).toISOString();
  const budget = trainBudget();
  const truths: ReputationTruth[] = [];
  for (let from = 0; from < Math.min(MAX_TRUTH, budget.scanRows); from += PAGE) {
    const { data, error } = await db
      .from("arrival_truth")
      .select("trip_id, stop_id, route_id, actual_arrival")
      .gte("actual_arrival", since)
      .order("actual_arrival", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data as {
      trip_id: string;
      stop_id: string;
      route_id: string;
      actual_arrival: string;
    }[]) {
      truths.push({
        tripId: r.trip_id,
        stopId: r.stop_id,
        routeId: r.route_id,
        actualMs: new Date(r.actual_arrival).getTime(),
      });
    }
    if (data.length < PAGE) break;
  }

  const tripIds = [...new Set(truths.map((t) => t.tripId))];
  const fixes: ReputationFix[] = [];
  // The adapter binds an IN list as one JSON parameter, so big chunks are
  // fine; cap the number of queries for the free plan.
  const CHUNK = 400;
  const maxChunks = 4;
  for (let i = 0; i < tripIds.length && i < CHUNK * maxChunks && fixes.length < Math.min(MAX_FIXES, budget.scanRows * 2); i += CHUNK) {
    const chunk = tripIds.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("rider_vehicle_fixes")
      .select("trip_id, device_id, lat, lng, reported_at, physics_score")
      .in("trip_id", chunk)
      .gte("reported_at", since)
      .limit(5000);
    if (error || !data) continue;
    for (const r of data as {
      trip_id: string;
      device_id: string;
      lat: number;
      lng: number;
      reported_at: string;
      physics_score: number | null;
    }[]) {
      if (r.physics_score != null && r.physics_score < RIDER_PHYSICS_FOLD_MIN) continue;
      fixes.push({
        tripId: r.trip_id,
        deviceId: r.device_id,
        lat: r.lat,
        lng: r.lng,
        tMs: new Date(r.reported_at).getTime(),
      });
    }
  }

  const errors = errorsByDevice(truths, fixes, stopOf);
  const rows: Array<{ device_id: string; score: number; n: number; updated_at: string }> = [];
  for (const [deviceId, err] of errors) {
    const r = scoreDeviceReputation(err);
    if (r.n === 0) continue;
    rows.push({ device_id: deviceId, score: r.score, n: r.n, updated_at: new Date(nowMs).toISOString() });
  }
  // One multi-row upsert (was one per device).
  const capped = rows.slice(0, budget.writeKeys);
  let devices = 0;
  if (capped.length) {
    const { error } = await db.from("device_reputation").upsert(capped, { onConflict: "device_id" });
    if (!error) devices = capped.length;
  }
  return { devices };
}
