import { API_BASE } from "./api";

export type PlanPoint = { lat: number; lng: number; label?: string };

export type Leg =
  | {
      kind: "ride";
      routeId: string;
      routeShort: string;
      routeLong: string;
      tripId: string;
      live: boolean;
      board: { stopId: string; name: string; lat: number; lng: number; departureUnix: number };
      alight: { stopId: string; name: string; lat: number; lng: number; arrivalUnix: number };
      stopCount: number;
      delaySec: number;
    }
  | {
      kind: "walk";
      from: { stopId?: string; name: string; lat: number; lng: number };
      to: { stopId?: string; name: string; lat: number; lng: number };
      durationSec: number;
      distanceMeters: number;
      verified: boolean;
      polyline?: string;
    }
  | {
      kind: "wait";
      stopId: string;
      name: string;
      lat: number;
      lng: number;
      durationSec: number;
    };

export type RationaleTag =
  | { kind: "fastest"; minutesEarlier: number }
  | { kind: "no-changes" }
  | { kind: "fewer-changes"; n: number }
  | { kind: "less-walking"; metersSaved: number }
  | { kind: "all-live" }
  | { kind: "more-reliable" }
  | { kind: "leaves-sooner"; minutesSooner: number }
  | { kind: "best-overall" };

export type Itinerary = {
  id: string;
  legs: Leg[];
  totalDurationSec: number;
  departureUnix: number;
  arrivalUnix: number;
  transfers: number;
  totalWalkMeters: number;
  score: number;
  source: "live" | "mixed" | "estimated";
  rationale?: RationaleTag[];
};

export type PlanResult = {
  itineraries: Itinerary[];
  searchedAt: number;
  elapsedMs: number;
  mode: "live" | "scheduled" | "both";
  noScheduleAvailable?: boolean;
};

export async function fetchPlan(args: {
  from: PlanPoint;
  to: PlanPoint;
  departAtUnix?: number;
  arriveByUnix?: number;
}): Promise<PlanResult> {
  const res = await fetch(`${API_BASE}/api/public/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plan ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
