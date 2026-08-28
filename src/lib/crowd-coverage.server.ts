// C3 I/O. Where rider phones actually are — and which busy lines are
// still dark. Missing tables fail open — silence.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RIDER_PHYSICS_FOLD_MIN } from "@aloya/core/rider-physics";
import {
  COVERAGE_WINDOW_HOURS,
  pickCoverageRoutes,
  unionDevicesByRoute,
  type CoverageReport,
} from "@aloya/core/crowd-coverage";
import { pickSparseSeeds } from "@aloya/core/sparse-seed";
import { getRoute, routeTone } from "@/lib/gtfs";

export type CrowdEyesRoute = {
  routeId: string;
  short: string;
  tone: "aegean" | "ochre" | "olive";
  devices: number;
};

async function loadReports(sinceIso: string): Promise<CoverageReport[]> {
  const out: CoverageReport[] = [];
  const [{ data: gps }, { data: taps }] = await Promise.all([
    // physics_score is present in production but missing from generated types.
    (supabaseAdmin.from("rider_vehicle_fixes") as unknown as {
      select: (cols: string) => {
        gte: (
          col: string,
          v: string,
        ) => {
          limit: (n: number) => PromiseLike<{
            data: { route_id: string | null; device_id: string | null; physics_score: number | null }[] | null;
          }>;
        };
      };
    })
      .select("route_id, device_id, physics_score")
      .gte("reported_at", sinceIso)
      .limit(5000),
    supabaseAdmin
      .from("bus_sightings")
      .select("route_id, device_id")
      .gte("reported_at", sinceIso)
      .limit(2000),
  ]);
  for (const r of gps ?? []) {
    const score = (r as { physics_score?: number | null }).physics_score;
    if (score != null && score < RIDER_PHYSICS_FOLD_MIN) continue;
    out.push({ routeId: r.route_id ?? "", deviceId: r.device_id ?? "" });
  }
  for (const r of taps ?? []) {
    out.push({ routeId: r.route_id ?? "", deviceId: r.device_id ?? "" });
  }
  return out;
}

async function loadRidership(): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin.rpc("pulse_route_stats");
  const map = new Map<string, number>();
  if (error || !data) return map;
  for (const row of data as { route_id: string; sample_count: number }[]) {
    if (!row.route_id) continue;
    map.set(row.route_id, Number(row.sample_count) || 0);
  }
  return map;
}

function named(rows: { routeId: string; devices: number }[]): CrowdEyesRoute[] {
  const out: CrowdEyesRoute[] = [];
  for (const r of rows) {
    const short = getRoute(r.routeId)?.short?.trim();
    if (!short) continue;
    out.push({
      routeId: r.routeId,
      short,
      tone: routeTone(r.routeId),
      devices: r.devices,
    });
  }
  return out;
}

export const getCrowdEyes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ routes: CrowdEyesRoute[]; seeds: CrowdEyesRoute[] }> => {
    try {
      const since = new Date(Date.now() - COVERAGE_WINDOW_HOURS * 3600 * 1000).toISOString();
      const [reports, ridership] = await Promise.all([loadReports(since), loadRidership()]);
      const byRoute = unionDevicesByRoute(reports);
      const devices = new Map(byRoute.map((r) => [r.routeId, r.devices]));
      const seedRows = [...ridership.entries()].map(([routeId, n]) => ({
        routeId,
        ridership: n,
        devices: devices.get(routeId) ?? 0,
      }));
      return {
        routes: named(pickCoverageRoutes(byRoute)),
        seeds: named(pickSparseSeeds(seedRows)),
      };
    } catch {
      return { routes: [], seeds: [] };
    }
  },
);
