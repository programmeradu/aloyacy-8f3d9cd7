// City geography, Cyprus wall-clock helpers and deterministic day seeds.

import type { TodayFocus, TodayInput } from "./types";

export const CITY_COORDS: Array<{ key: string; el: string; lat: number; lng: number }> = [
  { key: "Nicosia", el: "Λευκωσία", lat: 35.1856, lng: 33.3823 },
  { key: "Limassol", el: "Λεμεσός", lat: 34.7071, lng: 33.0226 },
  { key: "Larnaca", el: "Λάρνακα", lat: 34.9229, lng: 33.6233 },
  { key: "Paphos", el: "Πάφος", lat: 34.7768, lng: 32.4245 },
  { key: "Ayia Napa", el: "Αγία Νάπα", lat: 34.9882, lng: 34.0036 },
  { key: "Paralimni", el: "Παραλίμνι", lat: 35.0382, lng: 33.9728 },
];

export const WEEKDAY_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const WEEKDAY_EL = [
  "Κυριακή",
  "Δευτέρα",
  "Τρίτη",
  "Τετάρτη",
  "Πέμπτη",
  "Παρασκευή",
  "Σάββατο",
];

export function nearestCity(lat: number, lng: number): { key: string; el: string } {
  let best = CITY_COORDS[0];
  let bestD = Infinity;
  for (const c of CITY_COORDS) {
    const dx = c.lat - lat;
    const dy = c.lng - lng;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { key: best.key, el: best.el };
}

/** Wall-clock Cyprus time expressed in UTC fields (EET/EEST aware). */
export function cyprusNow(now: Date = new Date()): Date {
  const y = now.getUTCFullYear();
  const lastSunday = (m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0));
    return new Date(Date.UTC(y, m, last.getUTCDate() - last.getUTCDay()));
  };
  const inDst = now >= lastSunday(2) && now < lastSunday(9);
  const offsetMin = inDst ? 180 : 120;
  return new Date(now.getTime() + offsetMin * 60_000);
}

export function dayKey(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

export function dateString(d: Date): string {
  return `${d.getUTCFullYear()}-${dayKey(d)}`;
}

export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

/** Deterministic but varied choice, keyed by the date so it is stable per day. */
export function seededPick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/** Maps a Google weather condition code to our icon vocabulary. */
export function weatherIconKey(code: string): "sun" | "rain" | "cloud" | "storm" {
  const c = (code ?? "").toUpperCase();
  if (c.includes("THUNDER")) return "storm";
  if (c.includes("RAIN") || c.includes("SHOWER") || c.includes("DRIZZLE")) return "rain";
  if (c.includes("CLOUD")) return "cloud";
  return "sun";
}

export function resolveFocus(input: TodayInput): {
  focus: TodayFocus;
  wxLat: number;
  wxLng: number;
} {
  if (input.destCity) {
    const c = CITY_COORDS.find((x) => x.key === input.destCity) ?? CITY_COORDS[0];
    return {
      focus: { city: c.key, cityEl: c.el, scope: "trip" },
      wxLat: input.destLat ?? c.lat,
      wxLng: input.destLng ?? c.lng,
    };
  }
  if (input.destLat != null && input.destLng != null) {
    const c = nearestCity(input.destLat, input.destLng);
    return {
      focus: { city: c.key, cityEl: c.el, scope: "trip" },
      wxLat: input.destLat,
      wxLng: input.destLng,
    };
  }
  if (input.lat != null && input.lng != null) {
    const c = nearestCity(input.lat, input.lng);
    return {
      focus: { city: c.key, cityEl: c.el, scope: "city" },
      wxLat: input.lat,
      wxLng: input.lng,
    };
  }
  return {
    focus: { city: "Cyprus", cityEl: "Κύπρος", scope: "island" },
    wxLat: 35.1856,
    wxLng: 33.3823,
  };
}
