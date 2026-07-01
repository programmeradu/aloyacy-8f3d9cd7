// Native client for the CORS-open walking-directions endpoint. Returns
// the same `{ directions }` shape the web `getWalkingDirections` server
// fn produces, so `mobile/lib/useJourney` can consume walking steps as-is.

import { API_BASE } from "./api";
import type { WalkStep } from "@aloya/core/geo";

export type WalkingDirections = {
  steps: WalkStep[];
  polyline?: string;
  distanceMeters: number;
  durationSec: number;
};

export async function fetchWalkingDirections(args: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  locale?: "en" | "el";
}): Promise<{ directions: WalkingDirections | null }> {
  const res = await fetch(`${API_BASE}/api/public/walk-directions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return { directions: null };
  return res.json();
}

export function streetViewUrl(args: {
  lat: number;
  lng: number;
  heading: number;
  w?: number;
  h?: number;
  fov?: number;
}): string {
  const w = args.w ?? 640;
  const h = args.h ?? 360;
  const fov = args.fov ?? 85;
  return `${API_BASE}/api/public/streetview?lat=${args.lat}&lng=${args.lng}&heading=${Math.round(args.heading)}&w=${w}&h=${h}&fov=${fov}`;
}
