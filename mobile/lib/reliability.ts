// Mobile reliability client — mirrors the web `getRouteReliability`
// server-fn output. Returns one row per requested routeId; tier `unknown`
// when the learned-delay table doesn't have ≥30 weighted samples yet.

import { API_BASE } from "./api";

export type ReliabilityTier = "high" | "medium" | "low" | "unknown";

export type RouteReliability = {
  routeId: string;
  onTimePct: number;
  meanDelaySec: number;
  sampleCount: number;
  tier: ReliabilityTier;
};

export async function fetchRouteReliability(
  routeIds: string[],
): Promise<RouteReliability[]> {
  if (routeIds.length === 0) return [];
  const res = await fetch(`${API_BASE}/api/public/route-reliability`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ routeIds }),
  });
  if (!res.ok) throw new Error(`Reliability ${res.status}`);
  return res.json();
}

export type StopReliability = {
  stopId: string;
  routeIds: string[];
  onTimePct: number;
  meanDelaySec: number;
  sampleCount: number;
  tier: ReliabilityTier;
};

export async function fetchStopReliability(
  stopId: string,
  routeIds: string[],
): Promise<StopReliability | null> {
  if (!stopId || routeIds.length === 0) return null;
  const res = await fetch(`${API_BASE}/api/public/stop-reliability`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ stopId, routeIds: routeIds.slice(0, 30) }),
  });
  if (!res.ok) throw new Error(`Stop reliability ${res.status}`);
  return res.json();
}

