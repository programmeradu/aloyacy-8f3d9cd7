// Wave 3 — mobile fetchers for cross-island intel, taxi handoff,
// Nextbike, and Bolt scooters. All four wrappers live under
// `/api/public/*` on the same backend the web app uses; there is exactly
// one server-side implementation per signal.
import { API_BASE } from "./api";

// ── Intercity insights ────────────────────────────────────────────────────
export type IntercityInsightTier = "rated" | "learning" | "unknown";
export type IntercityWindow = {
  dayOfWeek: number; // 0=Sun … 6=Sat
  hourOfDay: number;
  meanDelaySec: number;
  sampleCount: number;
};
export type IntercityAnomaly = IntercityWindow & {
  deltaFromBaselineSec: number;
};
export type IntercityInsights = {
  routeId: string;
  tier: IntercityInsightTier;
  baselineMeanDelaySec: number;
  sampleCount: number;
  weekdayMeanDelaySec: number | null;
  weekendMeanDelaySec: number | null;
  bestWindow: IntercityWindow | null;
  worstWindow: IntercityWindow | null;
  anomalies: IntercityAnomaly[];
};

export async function fetchIntercityInsights(routeId: string): Promise<IntercityInsights> {
  const res = await fetch(
    `${API_BASE}/api/public/intercity-intel?routeId=${encodeURIComponent(routeId)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Intel ${res.status}`);
  return res.json();
}

// ── Last-mile chain ───────────────────────────────────────────────────────
export type LastMileChainTrigger = "long-walk" | "late-night" | "long-late";
export type LastMileChainSuggestion = {
  trigger: LastMileChainTrigger;
  drivingSec: number;
  distanceMeters: number;
  walkSec: number;
  fareLow: number;
  fareHigh: number;
  isNightRate: boolean;
  fromName: string;
  toName: string;
  boltDeepLink: string;
  mapsDeepLink: string;
  telDispatcher: string;
};

export async function fetchLastMileChain(args: {
  alight: { lat: number; lng: number; name?: string };
  destination: { lat: number; lng: number; name?: string };
  arrivalUnix?: number | null;
  finalWalkMeters?: number | null;
}): Promise<LastMileChainSuggestion | null> {
  const res = await fetch(`${API_BASE}/api/public/last-mile-chain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Bike share (Nextbike) ─────────────────────────────────────────────────
export type BikeStationNear = {
  uid: number;
  number: number;
  name: string;
  lat: number;
  lng: number;
  bikes: number;
  freeRacks: number;
  cityId: string;
  cityName: string;
  distanceM: number;
  walkSec: number;
};
export type BikeShareSuggestion = {
  pickup: BikeStationNear;
  dropoff: BikeStationNear;
  rideSec: number;
  rideMeters: number;
  totalSec: number;
  busOnlySec: number | null;
  savingsSec: number;
  reason: "faster" | "no-bus-only";
  cityName: string;
  webDeepLink: string;
  mapsDeepLink: string;
};

export async function fetchBikeShare(args: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  busOnlyDurationSec?: number | null;
}): Promise<BikeShareSuggestion | null> {
  const res = await fetch(`${API_BASE}/api/public/bike-share`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Bolt e-scooters (Nicosia) ─────────────────────────────────────────────
export type BoltZoneNear = {
  identifier: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  distanceM: number;
  walkSec: number;
};
export type BoltScooterSuggestion = {
  pickup: BoltZoneNear;
  dropoff: BoltZoneNear;
  rideSec: number;
  rideMeters: number;
  totalSec: number;
  busOnlySec: number | null;
  savingsSec: number;
  reason: "faster" | "no-bus-only";
  appDeepLink: string;
  mapsDeepLink: string;
};

export async function fetchBoltScooter(args: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  busOnlyDurationSec?: number | null;
}): Promise<BoltScooterSuggestion | null> {
  const res = await fetch(`${API_BASE}/api/public/bolt-scooter`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return res.json();
}
