// Traffic alerts client — calls the CyNAP-backed public endpoint with
// sample points from the planned itinerary and returns any incidents
// within 500 m of the path. Same source of truth as the web app.

import { API_BASE } from "./api";
import type { Itinerary, Leg } from "./plan";

export type TrafficIncidentKind =
  | "roadworks"
  | "closure"
  | "accident"
  | "congestion"
  | "weather"
  | "other";

export type ItineraryTrafficAlert = {
  id: string;
  kind: TrafficIncidentKind;
  severity: "low" | "medium" | "high";
  road: string | null;
  headline: string;
  distanceFromPathM: number;
  validFrom: string | null;
  validTo: string | null;
};

export type ItineraryTrafficReport = {
  highest: "low" | "medium" | "high";
  alerts: ItineraryTrafficAlert[];
  observedAt: string;
};

/** Board + alight for every ride, plus walk endpoints. Capped at 64. */
export function itinerarySamplePoints(it: Itinerary): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  for (const leg of it.legs as Leg[]) {
    if (leg.kind === "ride") {
      pts.push({ lat: leg.board.lat, lng: leg.board.lng });
      pts.push({ lat: leg.alight.lat, lng: leg.alight.lng });
    } else if (leg.kind === "walk") {
      pts.push({ lat: leg.from.lat, lng: leg.from.lng });
      pts.push({ lat: leg.to.lat, lng: leg.to.lng });
    } else if (leg.kind === "wait") {
      pts.push({ lat: leg.lat, lng: leg.lng });
    }
  }
  return pts.slice(0, 64);
}

export async function fetchItineraryTrafficAlerts(points: Array<{ lat: number; lng: number }>): Promise<ItineraryTrafficReport | null> {
  if (points.length === 0) return null;
  try {
    const res = await fetch(`${API_BASE}/api/public/traffic-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ points }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !Array.isArray(json.alerts) || json.alerts.length === 0) return null;
    return json as ItineraryTrafficReport;
  } catch {
    return null;
  }
}
