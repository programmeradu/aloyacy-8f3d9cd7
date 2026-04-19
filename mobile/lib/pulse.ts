// Pulse bundle client — one request → today briefing, road pulse, hourly
// strip, and live signals. Types mirror the web payloads
// (`src/lib/today.functions.ts`, `src/lib/pulse.functions.ts`,
// `src/lib/pulse-live.functions.ts`). Kept local so the mobile bundle
// never reaches into web-server modules.

import { API_BASE } from "./api";

/* Today briefing --------------------------------------------------------- */

export type TodayTheme = "derby" | "festival" | "holiday" | "cruise" | "heatwave" | "storm" | "calm";

export type TodayTileKind =
  | "match"
  | "festival"
  | "cruise"
  | "holiday"
  | "nameday"
  | "rhythm"
  | "weather-sun"
  | "weather-rain"
  | "weather-cloud";

export type TodayTile = {
  kind: TodayTileKind;
  kicker: string;
  kickerEl: string;
  title: string;
  titleEl: string;
  detail: string;
  detailEl: string;
  accent: "ochre" | "aegean" | "olive" | "ink";
};

export type TodayBriefing = {
  generatedAt: number;
  theme: TodayTheme;
  heroKey: TodayTheme;
  date: string;
  weekday: { en: string; el: string };
  headline: { en: string; el: string };
  lede: { en: string; el: string };
  tiles: TodayTile[];
  verdict: { en: string; el: string };
  fact: { en: string; el: string; tag: "local" | "tourist" };
  greekWord: { el: string; translit: string; en: string; meaning: string };
  focus: { city: string; cityEl: string; scope: "island" | "city" | "trip" };
};

/* Live road pulse -------------------------------------------------------- */

export type LivePulse = {
  generatedAt: number;
  windowMinutes: number;
  observations: number;
  onTimePct: number;
  earlyPct: number;
  latePct: number;
  medianDelaySec: number;
};

export type HourBucket = { hour: number; meanDelaySec: number; sampleCount: number };
export type HourStrip = { generatedAt: number; nowHour: number; buckets: HourBucket[] };

/* Live signals ----------------------------------------------------------- */

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  category: string | null;
  publishedAt: string;
};
export type NewsPayload = {
  count: number;
  items: NewsItem[];
  sources: string[];
  fetchedAt: string;
};

export type MarinePayload = {
  zone: string;
  city: string;
  waveHeightM: number | null;
  wavePeriodS: number | null;
  swellHeightM: number | null;
  seaTempC: number | null;
  beachVerdict: "great" | "good" | "choppy" | "rough" | null;
  summary: string;
  observedAt: string | null;
};

export type AirPayload = {
  zone: string;
  city: string;
  europeanAqi: number | null;
  pm10: number | null;
  pm25: number | null;
  band: "good" | "fair" | "moderate" | "poor" | "very-poor" | null;
  dustAlert: boolean;
  summary: string;
};

export type WeatherPayload = {
  city: string;
  tempC: number | null;
  feelsLikeC: number | null;
  windKmh: number | null;
  conditionCode: number | null;
  summary: string;
};

export type MetWarning = {
  level: "yellow" | "orange" | "red";
  kind: string;
  area: string;
  startsAt: string | null;
  endsAt: string | null;
  summary: string;
};
export type MetWarningsPayload = {
  count: number;
  warnings: MetWarning[];
  confidence: "high" | "medium" | "low";
};

export type CruiseShip = {
  shipName: string;
  line: string | null;
  arrival: string | null;
  departure: string | null;
  passengers: number | null;
};
export type CruisesPayload = {
  date: string;
  count: number;
  totalPassengers: number;
  ships: CruiseShip[];
  summary: string;
};

export type FlightItem = {
  callsign: string | null;
  direction: "arrival" | "departure";
  otherAirport: string | null;
  scheduled: string;
  estimated: string | null;
};
export type FlightsPayload = {
  airport: "LCLK" | "LCPH";
  city: string;
  arrivalsNext60: number;
  departuresNext60: number;
  arrivals: FlightItem[];
  departures: FlightItem[];
  summary: string;
};

export type EventItem = {
  title: string;
  city: string | null;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  url: string | null;
};
export type EventsPayload = { count: number; events: EventItem[] };

export type Fixture = {
  home: string;
  away: string;
  kickoff: string | null;
  venue: string | null;
  city: string | null;
  competition: string | null;
};
export type FixturesPayload = { count: number; fixtures: Fixture[] };

export type TrafficIncidentLite = {
  id: string;
  kind: "roadworks" | "closure" | "accident" | "congestion" | "weather" | "other";
  severity: "low" | "medium" | "high";
  road: string | null;
  headline: string;
  lat: number | null;
  lng: number | null;
  zone: string | null;
  validFrom: string | null;
  validTo: string | null;
};
export type TrafficLivePayload = {
  zone: string;
  count: number;
  highest: "low" | "medium" | "high";
  incidents: TrafficIncidentLite[];
  observedAt: string;
};

export type PulseLiveBundle = {
  generatedAt: number;
  focus: {
    id: string;
    label: string;
    labelEl: string;
    lat: number;
    lng: number;
    coastal: boolean;
  };
  weather: WeatherPayload | null;
  marine: MarinePayload | null;
  air: AirPayload | null;
  metWarnings: MetWarningsPayload | null;
  cruises: CruisesPayload | null;
  flights: FlightsPayload[];
  news: NewsPayload | null;
  events: EventsPayload | null;
  fixtures: FixturesPayload | null;
  traffic: TrafficLivePayload | null;
};

/* Bundle ---------------------------------------------------------------- */

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
