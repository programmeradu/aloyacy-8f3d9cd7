// Pure logic for "leave on time" adjustments. Given weather + recent
// route delay stats, returns how many extra seconds to leave earlier
// (vs the originally scheduled remind_at_unix) so the rider still makes
// the same arrival time.
//
// Used by /api/public/hooks/departure-tick to pre-adjust reminders that
// are coming up within the next hour.

export type WeatherCondition =
  | "clear"
  | "cloudy"
  | "rain-light"
  | "rain-heavy"
  | "snow"
  | "fog"
  | "thunder"
  | "unknown";

export type DelaySample = {
  route_id: string;
  mean_delay_sec: number;
  sample_count: number;
};

export type WeatherCoupling = {
  route_id: string;
  condition: string;
  mean_extra_delay_sec: number;
  sample_count: number;
};

// Open-Meteo WMO weather codes → our buckets.
// https://open-meteo.com/en/docs
export function classifyWmoCode(code: number | null | undefined): WeatherCondition {
  if (code == null) return "unknown";
  if (code === 0) return "clear";
  if (code >= 1 && code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 80, 81].includes(code)) return "rain-light";
  if ([65, 66, 67, 82].includes(code)) return "rain-heavy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunder";
  return "unknown";
}

// Static baseline buffer (sec) per condition when we have no route-specific
// coupling data. Tuned conservatively — better early than missed.
const STATIC_WEATHER_BUFFER_SEC: Record<WeatherCondition, number> = {
  clear: 0,
  cloudy: 0,
  fog: 90,
  "rain-light": 120,
  "rain-heavy": 300,
  snow: 420,
  thunder: 240,
  unknown: 0,
};

export type AdjusterInput = {
  /** Route ids touched by this trip (ride legs only). */
  routeIds: string[];
  /** Current observed weather at the origin. */
  weather: WeatherCondition;
  /** Recent per-route mean delay (from delay_stats pulse). Optional. */
  delays?: DelaySample[];
  /** Optional route×condition coupling rows for the current condition. */
  weatherCoupling?: WeatherCoupling[];
};

export type AdjusterResult = {
  extraSec: number;
  reasonShort: string | null; // e.g. "rain · +4 min"
  weather: WeatherCondition;
  trafficSec: number;
  weatherSec: number;
};

const MAX_EXTRA_SEC = 20 * 60; // never shift more than 20 min earlier

export function computeLeaveAdjustment(input: AdjusterInput): AdjusterResult {
  const { routeIds, weather, delays = [], weatherCoupling = [] } = input;

  // Weather component: prefer learned coupling for any of our routes,
  // fall back to static table.
  let weatherSec = 0;
  if (weather !== "clear" && weather !== "cloudy" && weather !== "unknown") {
    const matching = weatherCoupling.filter(
      (w) => routeIds.includes(w.route_id) && w.sample_count >= 3,
    );
    if (matching.length > 0) {
      const avg =
        matching.reduce((sum, w) => sum + w.mean_extra_delay_sec, 0) / matching.length;
      weatherSec = Math.max(0, Math.round(avg));
    } else {
      weatherSec = STATIC_WEATHER_BUFFER_SEC[weather];
    }
  }

  // Traffic component: pick the worst recent delay across our routes,
  // discounted (we don't want to double count weather).
  let trafficSec = 0;
  if (delays.length > 0 && routeIds.length > 0) {
    const relevant = delays.filter(
      (d) => routeIds.includes(d.route_id) && d.sample_count >= 3,
    );
    if (relevant.length > 0) {
      const worst = relevant.reduce(
        (m, d) => (d.mean_delay_sec > m ? d.mean_delay_sec : m),
        0,
      );
      // Only react when route is meaningfully late (> 90s avg).
      if (worst > 90) {
        trafficSec = Math.min(worst, 8 * 60);
      }
    }
  }

  const totalRaw = weatherSec + trafficSec;
  const extraSec = Math.min(MAX_EXTRA_SEC, totalRaw);

  let reasonShort: string | null = null;
  const parts: string[] = [];
  if (weatherSec >= 60) parts.push(`${weatherLabel(weather)} · +${Math.round(weatherSec / 60)} min`);
  if (trafficSec >= 60) parts.push(`traffic · +${Math.round(trafficSec / 60)} min`);
  if (parts.length > 0) reasonShort = parts.join(" / ");

  return { extraSec, reasonShort, weather, trafficSec, weatherSec };
}

function weatherLabel(c: WeatherCondition): string {
  switch (c) {
    case "rain-light":
      return "light rain";
    case "rain-heavy":
      return "heavy rain";
    case "snow":
      return "snow";
    case "fog":
      return "fog";
    case "thunder":
      return "storm";
    default:
      return "weather";
  }
}

// Tiny fetch wrapper for Open-Meteo current weather. Returns null on any error.
export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherCondition> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=weather_code,precipitation&timezone=auto`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4_000);
    const res = await fetchImpl(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return "unknown";
    const j = (await res.json()) as { current?: { weather_code?: number } };
    return classifyWmoCode(j?.current?.weather_code);
  } catch {
    return "unknown";
  }
}
