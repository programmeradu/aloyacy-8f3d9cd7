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

export function timeOfDayGreeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
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
