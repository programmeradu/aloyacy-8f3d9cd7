// Server-only helpers for live group trips: create groups with a short
// human-shareable code and compute member ETAs so the converging-on-a-place
// experience shows real minutes, not straight-line haversine guesses.
// Walking legs come from Mapbox; longer hops use Aloya's own bus planner.

import { createLogger, serializeError } from "@/lib/logger";
import { walkingRoute } from "@/lib/maps.server";
import { planJourney } from "@/lib/journey.server";

const log = createLogger("trip-groups");

/** Bus first for longer hops (bus is the point of the app), walking for
 *  short ones or when no bus itinerary exists. Returns whole minutes. */
export async function memberEtaMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(a));
  if (meters < 60) return 0;

  try {
    if (meters > 1200) {
      const options = await planJourney(from, to);
      const best = options[0];
      if (best) {
        const now = Math.floor(Date.now() / 1000);
        return Math.max(0, Math.round((best.arrivalUnix - now) / 60));
      }
    }
    const walk = await walkingRoute(from, to);
    return walk ? Math.max(0, Math.round(walk.durationSec / 60)) : null;
  } catch (e) {
    log.warn("eta failed", { ...serializeError(e) });
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
