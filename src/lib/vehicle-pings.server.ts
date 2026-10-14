// Persist and reload GTFS-RT vehicle pings for A2 vehicle-cross.
// Feed positions used to die with the request; the ledger needs history.

import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LiveVehicle } from "@/lib/gtfs-rt.server";
import type { VehiclePing } from "@aloya/core/vehicle-cross";

import { streamToLake } from "@/lib/lake.server";

const db = supabaseAdmin as unknown as SupabaseClient;

const PING_WINDOW_MS = 3 * 60 * 60_000;

export async function persistVehiclePings(
  vehicles: LiveVehicle[],
  fetchedAtUnix: number,
): Promise<number> {
  const captured = new Date(fetchedAtUnix * 1000).toISOString();
  const rows = vehicles
    .filter((v) => v.tripId && Number.isFinite(v.lat) && Number.isFinite(v.lng))
    .map((v) => ({
      captured_at: v.timestamp > 0 ? new Date(v.timestamp * 1000).toISOString() : captured,
      trip_id: v.tripId,
      route_id: v.routeId ?? "",
      vehicle_id: v.id ?? "",
      lat: v.lat,
      lng: v.lng,
      bearing: Number.isFinite(v.bearing) ? v.bearing : null,
      speed_mps: Number.isFinite(v.speed) ? v.speed : null,
      source: v.source === "rider" ? "rider" : "feed",
    }));
  if (rows.length === 0) return 0;
  
  // Archive-on-ingest: raw vehicle pings to lake
  void streamToLake("vehicle_pings", rows.slice());
  
  // D1 free plan: 100k rows written/day. Every capture still lands in the R2
  // lake; D1 keeps a sampled, capped history (tunable, see docs/D1_MIGRATION.md).
  const everyMin = Math.max(1, Number(process.env.D1_PINGS_EVERY_MIN ?? 30));
  const maxRows = Math.max(0, Number(process.env.D1_PINGS_MAX_ROWS ?? 300));
  if (Math.floor(fetchedAtUnix / 60) % everyMin !== 0) return 0;
  const { error } = await db.from("vehicle_pings").insert(rows.slice(0, maxRows));
  if (error) return 0;
  return rows.length;
}

export async function loadTripPings(
  tripIds: string[],
  nowMs = Date.now(),
): Promise<Map<string, VehiclePing[]>> {
  const out = new Map<string, VehiclePing[]>();
  if (tripIds.length === 0) return out;
  const from = new Date(nowMs - PING_WINDOW_MS).toISOString();
  const unique = [...new Set(tripIds)].slice(0, 200);
  const { data: feed } = await db
    .from("vehicle_pings")
    .select("trip_id, lat, lng, captured_at")
    .in("trip_id", unique)
    .gte("captured_at", from)
    .order("captured_at", { ascending: true })
    .limit(4000);
  for (const row of feed ?? []) {
    const ping: VehiclePing = {
      tMs: new Date(row.captured_at as string).getTime(),
      lat: row.lat as number,
      lng: row.lng as number,
    };
    const arr = out.get(row.trip_id as string) ?? [];
    arr.push(ping);
    out.set(row.trip_id as string, arr);
  }
  const { data: riders } = await db
    .from("rider_vehicle_fixes")
    .select("trip_id, lat, lng, reported_at")
    .in("trip_id", unique)
    .gte("reported_at", from)
    .order("reported_at", { ascending: true })
    .limit(2000);
  for (const row of riders ?? []) {
    const ping: VehiclePing = {
      tMs: new Date(row.reported_at as string).getTime(),
      lat: row.lat as number,
      lng: row.lng as number,
    };
    const arr = out.get(row.trip_id as string) ?? [];
    arr.push(ping);
    out.set(row.trip_id as string, arr);
  }
  for (const [id, arr] of out) {
    arr.sort((a, b) => a.tMs - b.tMs);
    out.set(id, arr);
  }
  return out;
}
