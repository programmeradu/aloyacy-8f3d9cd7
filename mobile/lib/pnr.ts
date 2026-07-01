// Park & Ride — driving + bus combo suggested when a hub interception
// genuinely beats the bus-only itinerary. Same shape as the web.
import { API_BASE } from "./api";

export type ParkAndRideSuggestion = {
  hub: {
    id: string;
    label: string;
    note?: string;
    lat: number;
    lng: number;
    ev?: {
      count: number;
      kwMax: number;
      kind: "ac" | "dc";
      network: string;
      live?: {
        available: number | null;
        total: number;
        kwMax: number;
        kind: "ac" | "dc";
        operator: string | null;
        updatedUnix: number | null;
      };
    };
  };
  driveSec: number;
  driveMeters: number;
  bus: {
    firstRoute: string | null;
    boardName: string;
    durationSec: number;
    arrivalUnix: number;
  };
  totalSec: number;
  busOnlySec: number | null;
  savingsSec: number;
  reason: "faster" | "comfort" | "no-bus-only" | "traffic-jam";
  liveTraffic?: {
    directDriveSec: number;
    freeFlowSec: number;
    delaySec: number;
    severity: number;
    notable: boolean;
  };
};


export async function fetchParkAndRide(args: {
  from: { lat: number; lng: number; label?: string };
  to: { lat: number; lng: number; label?: string };
  busOnlyDurationSec: number | null;
  busOnlyAccessWalkM: number | null;
}): Promise<ParkAndRideSuggestion | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/park-and-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
