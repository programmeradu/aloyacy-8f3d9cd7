// Traffic-on-route watcher. Pulls the CyNAP DATEX II incidents already
// ingested into `pulse_signals` (via /api/public/pulse) and filters to
// incidents that sit within ~800m of any ride-leg waypoint in the active
// trip. Runs every 90s while a trip is active; silent otherwise.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { distanceM } from "@aloya/core/geo";
import { fetchPulseBundle, type TrafficIncidentLite } from "./pulse";
import type { ActiveTrip } from "./trip-store";
import type { RideLeg } from "./journey-types";

const CORRIDOR_M = 800;

export type TrafficRouteAlert = {
  incidents: TrafficIncidentLite[];
  highest: "low" | "medium" | "high";
  headline: string;
};

function corridorPoints(itin: ActiveTrip["itinerary"]): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  if (!itin) return pts;
  for (const leg of itin.legs) {
    if (leg.kind === "ride") {
      const r = leg as RideLeg;
      pts.push({ lat: r.board.lat, lng: r.board.lng });
      pts.push({ lat: r.alight.lat, lng: r.alight.lng });
    }
  }
  return pts;
}

export function useTrafficWatch(active: ActiveTrip | null): TrafficRouteAlert | null {
  const focus = active
    ? { lat: active.from.lat, lng: active.from.lng, destLat: active.to.lat, destLng: active.to.lng }
    : null;

  const q = useQuery({
    queryKey: focus ? ["trafficWatch", focus.lat, focus.lng, focus.destLat, focus.destLng] : ["trafficWatch", "none"],
    queryFn: () => fetchPulseBundle(focus!),
    enabled: !!active,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });

  return useMemo(() => {
    if (!active || !q.data?.signals.traffic) return null;
    const points = corridorPoints(active.itinerary);
    if (!points.length) return null;
    const hits = q.data.signals.traffic.incidents.filter((inc) => {
      if (inc.lat == null || inc.lng == null) return false;
      return points.some((p) => distanceM(p, { lat: inc.lat!, lng: inc.lng! }) <= CORRIDOR_M);
    });
    if (!hits.length) return null;
    const order = { low: 0, medium: 1, high: 2 } as const;
    const highest = hits.reduce<"low" | "medium" | "high">(
      (acc, i) => (order[i.severity] > order[acc] ? i.severity : acc),
      "low",
    );
    const top = hits.slice().sort((a, b) => order[b.severity] - order[a.severity])[0];
    const road = top.road ? `${top.road} · ` : "";
    const rest = hits.length - 1;
    const headline = rest > 0
      ? `${road}${top.headline} · +${rest} more on your route`
      : `${road}${top.headline}`;
    return { incidents: hits, highest, headline };
  }, [active, q.data]);
}
