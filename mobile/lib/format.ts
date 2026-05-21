/**
 * ETA formatting — mirrors the web `EtaPill` semantics.
 * Confidence tiers track `eta-v2` thresholds: <60s "now", <10min "exact
 * minutes", else clock time. Stale/ghost handled by the caller.
 */
export type EtaTier = "now" | "soon" | "scheduled" | "past";

export function etaFromUnix(
  arrivalUnix: number,
  nowMs: number = Date.now(),
): { label: string; minutes: number; tier: EtaTier } {
  const diffMs = arrivalUnix * 1000 - nowMs;
  const minutes = Math.round(diffMs / 60_000);
  if (diffMs < -45_000) return { label: "Gone", minutes, tier: "past" };
  if (diffMs < 60_000) return { label: "Now", minutes: 0, tier: "now" };
  if (minutes < 10) return { label: `${minutes} min`, minutes, tier: "soon" };
  const d = new Date(arrivalUnix * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { label: `${hh}:${mm}`, minutes, tier: "scheduled" };
}

// Compute Orthodox Easter (Meeus / Julian → Gregorian) for a given year.
function orthodoxEaster(year: number): { m: number; d: number } {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const jd = new Date(Date.UTC(year, month - 1, day));
  jd.setUTCDate(jd.getUTCDate() + 13);
  return { m: jd.getUTCMonth() + 1, d: jd.getUTCDate() };
}

/**
 * Cyprus / Greek time-of-day greeting — mirrors web `src/lib/greeting.ts`.
 *   05–12 Kalimera · 12–17 Kalo mesimeri · 17–22 Kalispera · 22–05 Kalinychta.
 * Overrides on Cypriot & Orthodox holidays.
 */
export function timeOfDayGreeting(date = new Date()): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();

  if (m === 1 && d === 1) return "Kali chronia";
  if (m === 1 && d === 6) return "Kala Fota";
  if (m === 3 && d === 25) return "Chronia polla";
  if (m === 4 && d === 1) return "Chronia polla";
  if (m === 8 && d === 15) return "Chronia polla";
  if (m === 10 && d === 1) return "Chronia polla";
  if (m === 10 && d === 28) return "Chronia polla";
  if (m === 12 && (d === 24 || d === 25 || d === 26)) return "Kala Christougenna";
  if (m === 12 && d === 31) return "Kali protochronia";

  const e = orthodoxEaster(date.getFullYear());
  const easter = new Date(date.getFullYear(), e.m - 1, e.d);
  const diffDays = Math.round((date.getTime() - easter.getTime()) / 86_400_000);
  if (diffDays >= -1 && diffDays <= 1) return "Christos anesti";

  if (h >= 5 && h < 12) return "Kalimera";
  if (h >= 12 && h < 17) return "Kalo mesimeri";
  if (h >= 17 && h < 22) return "Kalispera";
  return "Kalinychta";
}


/** Haversine in metres. Same math as web `lib/geo`. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m: number): string {
  if (m < 950) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
