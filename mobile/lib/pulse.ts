// Pulse bundle client — one request → today briefing, road pulse, hourly
// strip, and live signals. Mirrors the payload the web /pulse route composes.

import { API_BASE } from "./api";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import type { LivePulse, HourStrip } from "@/lib/pulse.functions";
import type { TodayBriefing } from "@/lib/today.functions";

export type PulseBundle = {
  today: TodayBriefing;
  live: LivePulse;
  hourly: HourStrip;
  signals: PulseLiveBundle;
};

export async function fetchPulseBundle(coords?: {
  lat?: number;
  lng?: number;
  destLat?: number;
  destLng?: number;
}): Promise<PulseBundle> {
  const q = new URLSearchParams();
  if (coords?.lat != null) q.set("lat", String(Math.round(coords.lat * 100) / 100));
  if (coords?.lng != null) q.set("lng", String(Math.round(coords.lng * 100) / 100));
  if (coords?.destLat != null) q.set("destLat", String(Math.round(coords.destLat * 100) / 100));
  if (coords?.destLng != null) q.set("destLng", String(Math.round(coords.destLng * 100) / 100));
  const qs = q.toString();
  const res = await fetch(`${API_BASE}/api/public/pulse${qs ? `?${qs}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Pulse ${res.status}`);
  return res.json();
}

export type {
  TodayBriefing,
  TodayTile,
  TodayTheme,
  TodayTileKind,
} from "@/lib/today.functions";
export type { LivePulse, HourStrip, HourBucket } from "@/lib/pulse.functions";
export type {
  PulseLiveBundle,
  MarinePayload,
  AirPayload,
  WeatherPayload,
  MetWarningsPayload,
  CruisesPayload,
  FlightsPayload,
  NewsPayload,
  EventsPayload,
  FixturesPayload,
  TrafficLivePayload,
} from "@/lib/pulse-live.functions";
