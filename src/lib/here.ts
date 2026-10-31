// One-shot device location for the Go screen: the locate button on the From
// field and the "Use my current location" row in the place sheets. Writes the
// same cache the home screen and the trip seed read, so every surface agrees.

export const GEO_CACHE_KEY = "aloya:geo";

export type HereResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; denied: boolean };

export function readCachedHere(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { lat: number; lng: number };
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? { lat: p.lat, lng: p.lng } : null;
  } catch {
    return null;
  }
}

export function locateHere(): Promise<HereResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve({ ok: false, denied: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ lat, lng, ts: Date.now() }));
        } catch {
          // Private mode: the fix still applies for this session.
        }
        resolve({ ok: true, lat, lng });
      },
      (err) => resolve({ ok: false, denied: err?.code === 1 }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/** Permission state without prompting. "unknown" where the API is missing. */
export async function geoPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
    const s = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return s.state;
  } catch {
    return "unknown";
  }
}

/** "Street 16, 2660 Town, Cyprus" reads as "Street 16, 2660 Town". */
export function shortAddress(full: string): string | null {
  const s = full.trim();
  if (!s || /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(s)) return null;
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  const kept = parts.filter((x) => !/^(cyprus|κύπρος)$/i.test(x));
  return kept.slice(0, 2).join(", ") || null;
}
