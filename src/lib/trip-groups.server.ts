// Server-only helpers for live group trips: create groups with a short
// human-shareable code and compute member ETAs via Google Routes so the
// converging-on-a-place experience shows real minutes, not straight-line
// haversine guesses.

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

function authHeaders(extra: Record<string, string> = {}) {
  const lk = process.env.LOVABLE_API_KEY;
  const gk = process.env.GOOGLE_MAPS_API_KEY;
  if (!lk) throw new Error("LOVABLE_API_KEY missing");
  if (!gk) throw new Error("GOOGLE_MAPS_API_KEY missing");
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": gk,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Try transit first (bus is the point of the app), fall back to walking
 *  for short hops or when Google can't build a transit itinerary. Returns
 *  minutes rounded to the nearest whole minute. */
export async function memberEtaMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  // Haversine gate — no point pinging Google for 40 m
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(a));
  if (meters < 60) return 0;

  const mode = meters > 1200 ? "TRANSIT" : "WALK";
  try {
    const body: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: mode,
      languageCode: "en",
      units: "METRIC",
    };
    if (mode === "TRANSIT") {
      Object.assign(body, {
        transitPreferences: { allowedTravelModes: ["BUS"] },
        departureTime: new Date().toISOString(),
      });
    }
    const res = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: authHeaders({ "X-Goog-FieldMask": "routes.duration" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Transit unavailable — fall back to walking so we still return an ETA.
      if (mode === "TRANSIT") return walkingEtaMinutes(from, to);
      return null;
    }
    const json = (await res.json()) as { routes?: { duration: string }[] };
    const dur = json.routes?.[0]?.duration;
    if (!dur) {
      if (mode === "TRANSIT") return walkingEtaMinutes(from, to);
      return null;
    }
    const secs = parseInt(dur.replace("s", ""), 10) || 0;
    return Math.max(0, Math.round(secs / 60));
  } catch (e) {
    console.warn("[trip-groups] eta failed", e);
    return null;
  }
}

async function walkingEtaMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  try {
    const res = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: authHeaders({ "X-Goog-FieldMask": "routes.duration" }),
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "WALK",
        languageCode: "en",
        units: "METRIC",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { routes?: { duration: string }[] };
    const dur = json.routes?.[0]?.duration;
    if (!dur) return null;
    return Math.max(0, Math.round((parseInt(dur.replace("s", ""), 10) || 0) / 60));
  } catch {
    return null;
  }
}

/** 6-char uppercase alphanumeric code, unambiguous (no O/0/I/1). */
export function generateGroupCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
