// C3 I/O. Where rider phones actually are. Missing tables fail open — silence.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RIDER_PHYSICS_FOLD_MIN } from "@aloya/core/rider-physics";
import {
  COVERAGE_WINDOW_HOURS,
  pickCoverageRoutes,
  unionDevicesByRoute,
  type CoverageReport,
} from "@aloya/core/crowd-coverage";
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
    supabaseAdmin
      .from("rider_vehicle_fixes")
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

export const getCrowdEyes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ routes: CrowdEyesRoute[] }> => {
    try {
      const since = new Date(Date.now() - COVERAGE_WINDOW_HOURS * 3600 * 1000).toISOString();
      const picked = pickCoverageRoutes(unionDevicesByRoute(await loadReports(since)));
      const routes: CrowdEyesRoute[] = [];
      for (const r of picked) {
        const meta = getRoute(r.routeId);
        const short = meta?.short?.trim();
        if (!short) continue;
        routes.push({
          routeId: r.routeId,
          short,
          tone: routeTone(r.routeId),
          devices: r.devices,
        });
      }
      return { routes };
    } catch {
      return { routes: [] };
    }
  },
);
