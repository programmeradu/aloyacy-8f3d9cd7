// Server-only Google Maps client (Places New, Geocoding, Routes).
// Prioritizes direct Google Maps Platform APIs using GOOGLE_MAPS_SERVER_KEY / GOOGLE_MAPS_API_KEY
// with automated failover to GOOGLE_MAPS_BACKUP_KEY, and legacy fallback to Lovable connector gateway.

import { createLogger, serializeError } from "@/lib/logger";
import {
  authHeaders,
  fetchMapsWithFailover,
  getLastMapsError,
  type MapsRequestPlan,
} from "./maps-core.server";

export { authHeaders, fetchMapsWithFailover, getLastMapsError, type MapsRequestPlan };

const log = createLogger("maps");
const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";


export type PlaceSuggestion = {

  placeId: string;
  primary: string;
  secondary: string;
};

export async function placesAutocomplete(
  input: string,
  bias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<PlaceSuggestion[]> {
  if (!input.trim()) return [];
  const bodyPayload: Record<string, unknown> = {
    input,
    includedRegionCodes: ["cy"],
    languageCode: "en",
  };
  if (bias) {
    bodyPayload.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: bias.radiusMeters ?? 30000,
      },
    };
  }
  const bodyStr = JSON.stringify(bodyPayload);

  const res = await fetchMapsWithFailover({
    direct: () => ({
      url: "https://places.googleapis.com/v1/places:autocomplete",
      method: "POST",
      body: bodyStr,
    }),
    gateway: () => ({
      url: `${GATEWAY}/places/v1/places:autocomplete`,
      method: "POST",
      body: bodyStr,
    }),
  });

  if (!res.ok) throw new Error(`autocomplete ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        structuredFormat?: {
          mainText?: { text: string };
          secondaryText?: { text: string };
        };
        text?: { text: string };
      };
    }[];
  };
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      placeId: p.placeId,
      primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

export type ResolvedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export async function resolvePlace(placeId: string): Promise<ResolvedPlace> {
  const fieldMask = "id,displayName,formattedAddress,location";
  const res = await fetchMapsWithFailover({
    direct: () => ({
      url: `https://places.googleapis.com/v1/places/${placeId}`,
      method: "GET",
      headers: { "X-Goog-FieldMask": fieldMask },
    }),
    gateway: () => ({
      url: `${GATEWAY}/places/v1/places/${placeId}`,
      method: "GET",
      headers: { "X-Goog-FieldMask": fieldMask },
    }),
  });

  if (!res.ok) throw new Error(`place ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
  };
  return {
    placeId: json.id,
    name: json.displayName?.text ?? json.formattedAddress ?? "Unknown",
    address: json.formattedAddress ?? "",
    lat: json.location?.latitude ?? 0,
    lng: json.location?.longitude ?? 0,
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetchMapsWithFailover({
    direct: (key) => ({
      url: `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=street_address|premise|route&key=${key}`,
      method: "GET",
    }),
    gateway: () => ({
      url: `${GATEWAY}/maps/api/geocode/json?latlng=${lat},${lng}&result_type=street_address|premise|route`,
      method: "GET",
    }),
  });

  if (!res.ok) throw new Error(`reverse ${res.status}`);
  const json = (await res.json()) as {
    results?: { formatted_address: string }[];
  };
  return json.results?.[0]?.formatted_address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export type WalkSegment = {
  durationSec: number;
  distanceMeters: number;
  polyline: string; // encoded
};

export async function walkingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<WalkSegment | null> {
  const bodyStr = JSON.stringify({
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: "WALK",
    languageCode: "en",
    units: "METRIC",
  });
  const fieldMask = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";

  try {
    const res = await fetchMapsWithFailover({
      direct: () => ({
        url: "https://routes.googleapis.com/directions/v2:computeRoutes",
        method: "POST",
        headers: { "X-Goog-FieldMask": fieldMask },
        body: bodyStr,
      }),
      gateway: () => ({
        url: `${GATEWAY}/routes/directions/v2:computeRoutes`,
        method: "POST",
        headers: { "X-Goog-FieldMask": fieldMask },
        body: bodyStr,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: {
        duration: string;
        distanceMeters: number;
        polyline?: { encodedPolyline: string };
      }[];
    };
    const r = json.routes?.[0];
    if (!r) return null;
    return {
      durationSec: parseInt(r.duration.replace("s", ""), 10) || 0,
      distanceMeters: r.distanceMeters,
      polyline: r.polyline?.encodedPolyline ?? "",
    };
  } catch (e) {
    log.warn("walkingRoute failed", { ...serializeError(e) });
    return null;
  }
}

export type WalkStep = {
  instruction: string; // plain text, no HTML
  distanceMeters: number;
  durationSec: number;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  maneuver: string;
  polyline: string;
  /** suggested street-view heading from start → end, in degrees */
  heading: number;
};

export type WalkDirections = {
  durationSec: number;
  distanceMeters: number;
  polyline: string;
  steps: WalkStep[];
};

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export async function walkingDirections(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  languageCode: string = "en",
): Promise<WalkDirections | null> {
  const bodyStr = JSON.stringify({
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: "WALK",
    languageCode,
    units: "METRIC",
  });
  const fieldMask =
    "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps";

  try {
    const res = await fetchMapsWithFailover({
      direct: () => ({
        url: "https://routes.googleapis.com/directions/v2:computeRoutes",
        method: "POST",
        headers: { "X-Goog-FieldMask": fieldMask },
        body: bodyStr,
      }),
      gateway: () => ({
        url: `${GATEWAY}/routes/directions/v2:computeRoutes`,
        method: "POST",
        headers: { "X-Goog-FieldMask": fieldMask },
        body: bodyStr,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      lastMapsError = { status: res.status, text: errText };
      log.error("walking directions computeRoutes failed", undefined, { status: res.status, body: errText });
      return null;
    }
    type Step = {
      distanceMeters?: number;
      staticDuration?: string;
      polyline?: { encodedPolyline: string };
      startLocation?: { latLng: { latitude: number; longitude: number } };
      endLocation?: { latLng: { latitude: number; longitude: number } };
      navigationInstruction?: { instructions?: string; maneuver?: string };
    };
    const json = (await res.json()) as {
      routes?: {
        duration: string;
        distanceMeters: number;
        polyline?: { encodedPolyline: string };
        legs?: { steps?: Step[] }[];
      }[];
    };
    const r = json.routes?.[0];
    if (!r) {
      lastMapsError = { status: res.status, text: "No route in response: " + JSON.stringify(json) };
      return null;
    }
    const rawSteps = r.legs?.flatMap((l) => l.steps ?? []) ?? [];
    const steps: WalkStep[] = rawSteps.map((s) => {
      const start = {
        lat: s.startLocation?.latLng.latitude ?? 0,
        lng: s.startLocation?.latLng.longitude ?? 0,
      };
      const end = {
        lat: s.endLocation?.latLng.latitude ?? 0,
        lng: s.endLocation?.latLng.longitude ?? 0,
      };
      return {
        instruction: s.navigationInstruction?.instructions?.replace(/<[^>]+>/g, "") ?? "Continue",
        distanceMeters: s.distanceMeters ?? 0,
        durationSec: parseInt((s.staticDuration ?? "0s").replace("s", ""), 10) || 0,
        start,
        end,
        maneuver: s.navigationInstruction?.maneuver ?? "straight",
        polyline: s.polyline?.encodedPolyline ?? "",
        heading: bearing(start, end),
      };
    });
    return {
      durationSec: parseInt(r.duration.replace("s", ""), 10) || 0,
      distanceMeters: r.distanceMeters,
      polyline: r.polyline?.encodedPolyline ?? "",
      steps,
    };
  } catch (e) {
    log.warn("walkingDirections failed", { ...serializeError(e) });
    return null;
  }
}

/** Live drive ETA using Google Routes API with traffic-aware routing.
 *  Also returns `staticDurationSec` (free-flow, no traffic) so callers can
 *  measure how much live traffic is hurting this leg right now — the basis
 *  for "why we're suggesting Park & Ride: A1 is in the red" reasoning. */
export async function drivingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<{
  durationSec: number;
  staticDurationSec: number;
  distanceMeters: number;
} | null> {
  const bodyStr = JSON.stringify({
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    languageCode: "en",
    units: "METRIC",
  });
  const fieldMask = "routes.duration,routes.staticDuration,routes.distanceMeters";

  try {
    const res = await fetchMapsWithFailover({
      direct: () => ({
        url: "https://routes.googleapis.com/directions/v2:computeRoutes",
        method: "POST",
        headers: { "X-Goog-FieldMask": fieldMask },
        body: bodyStr,
      }),
      gateway: () => ({
        url: `${GATEWAY}/routes/directions/v2:computeRoutes`,
        method: "POST",
        headers: { "X-Goog-FieldMask": fieldMask },
        body: bodyStr,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log.error("drivingRoute computeRoutes failed", undefined, { status: res.status, body: errText });
      return null;
    }
    const json = (await res.json()) as {
      routes?: {
        duration: string;
        staticDuration?: string;
        distanceMeters: number;
      }[];
    };
    const r = json.routes?.[0];
    if (!r) return null;
    const live = parseInt(r.duration.replace("s", ""), 10) || 0;
    const free = parseInt((r.staticDuration ?? r.duration).replace("s", ""), 10) || live;
    return {
      durationSec: live,
      staticDurationSec: free,
      distanceMeters: r.distanceMeters,
    };
  } catch (e) {
    log.warn("drivingRoute failed", { ...serializeError(e) });
    return null;
  }
}
