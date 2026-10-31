// Server-only maps client on Mapbox (Geocoding v6 + Directions v5).
// Replaced Google Places, Geocoding and Routes in Oct 2026 after the Google
// Cloud account suspension. Exported names and shapes are unchanged so every
// caller (journey planner, walk links, taxi quote, park and ride, last mile)
// keeps working untouched.
//
// Free tier (mapbox.com/pricing, Oct 2026): 100k geocoding, 100k
// directions requests a month; Search Box /forward is billed per request.

import polyline from "@mapbox/polyline";
import { createLogger, serializeError } from "@/lib/logger";
import {
  coordPair,
  getLastMapsError,
  mapboxFetch,
  setLastMapsError,
  type LngLat,
} from "./maps-core.server";

export { getLastMapsError, setLastMapsError, mapboxFetch };

const log = createLogger("maps");

/** Cyprus bounding box (minLng,minLat,maxLng,maxLat). */
const CY_BBOX = "32.2,34.55,34.65,35.75";

// ---------------------------------------------------------------- search

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

/**
 * Mapbox geocoding returns coordinates with each suggestion, so the placeId
 * carries them and resolvePlace needs no second (billable) call.
 */
function encodePlaceId(p: ResolvedPlace): string {
  const raw = JSON.stringify([p.lat, p.lng, p.name, p.address, p.placeId]);
  const bytes = new TextEncoder().encode(raw);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return "mbx." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePlaceId(id: string): ResolvedPlace | null {
  if (!id.startsWith("mbx.")) return null;
  try {
    const b64 = id.slice(4).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const [lat, lng, name, address, mapboxId] = JSON.parse(new TextDecoder().decode(bytes));
    return { placeId: String(mapboxId ?? id), name, address, lat: Number(lat), lng: Number(lng) };
  } catch {
    return null;
  }
}

type GeoFeature = {
  id?: string;
  properties: {
    mapbox_id?: string;
    name?: string;
    name_preferred?: string;
    place_formatted?: string;
    full_address?: string;
    coordinates?: { latitude: number; longitude: number };
  };
  geometry?: { coordinates: [number, number] };
};

function featureToPlace(f: GeoFeature): ResolvedPlace {
  const p = f.properties;
  const lat = p.coordinates?.latitude ?? f.geometry?.coordinates[1] ?? 0;
  const lng = p.coordinates?.longitude ?? f.geometry?.coordinates[0] ?? 0;
  return {
    placeId: p.mapbox_id ?? f.id ?? `${lat},${lng}`,
    name: p.name_preferred ?? p.name ?? p.full_address ?? "Unknown",
    address: p.full_address ?? p.place_formatted ?? "",
    lat,
    lng,
  };
}

export async function placesAutocomplete(
  input: string,
  bias?: { lat: number; lng: number; radiusMeters?: number },
  language: string = "en",
): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (!q) return [];
  const lang = language === "el" ? "el" : "en";
  const common = new URLSearchParams({ q, country: "cy", bbox: CY_BBOX, limit: "8", language: lang });
  if (bias) common.set("proximity", `${bias.lng},${bias.lat}`);

  // 1. Search Box /forward: places, addresses AND points of interest
  //    (universities, malls, hospitals). Billed per request, no session.
  let features: GeoFeature[] = [];
  try {
    const p = new URLSearchParams(common);
    p.set("auto_complete", "true");
    const res = await mapboxFetch(`/search/searchbox/v1/forward?${p}`);
    if (res.ok) features = ((await res.json()) as { features?: GeoFeature[] }).features ?? [];
  } catch (e) {
    log.warn("searchbox forward failed", { ...serializeError(e) });
  }
  // 2. Geocoding v6 fallback (addresses and streets only).
  if (features.length === 0) {
    const p = new URLSearchParams(common);
    p.set("autocomplete", "true");
    const res = await mapboxFetch(`/search/geocode/v6/forward?${p}`);
    if (!res.ok) throw new Error(`autocomplete ${res.status}: ${await res.text()}`);
    features = ((await res.json()) as { features?: GeoFeature[] }).features ?? [];
  }
  return features
    .filter((f) => (f as { properties: { feature_type?: string } }).properties.feature_type !== "country")
    .map((f) => {
      const place = featureToPlace(f);
      return {
        placeId: encodePlaceId(place),
        primary: place.name,
        secondary: f.properties.place_formatted ?? place.address,
      };
    });
}

export type ResolvedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export async function resolvePlace(placeId: string): Promise<ResolvedPlace> {
  const local = decodePlaceId(placeId);
  if (local) return local;
  // Raw mapbox_id (older saved places): look it up.
  const res = await mapboxFetch(`/search/geocode/v6/forward?q=${encodeURIComponent(placeId)}&country=cy&limit=1`);
  if (!res.ok) throw new Error(`place ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { features?: GeoFeature[] };
  const f = json.features?.[0];
  if (!f) throw new Error("place not found");
  return featureToPlace(f);
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  language?: "en" | "el",
): Promise<string> {
  const lang = language ? `&language=${language}` : "";
  const res = await mapboxFetch(
    `/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=address,street&limit=1${lang}`,
  );
  if (!res.ok) throw new Error(`reverse ${res.status}`);
  const json = (await res.json()) as { features?: GeoFeature[] };
  const f = json.features?.[0];
  return f?.properties.full_address ?? f?.properties.name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ---------------------------------------------------------------- routing

type MbxStep = {
  distance: number;
  duration: number;
  geometry: string;
  name?: string;
  maneuver: {
    type: string;
    modifier?: string;
    instruction?: string;
    location: [number, number];
  };
};

type MbxRoute = {
  duration: number;
  duration_typical?: number;
  distance: number;
  geometry: string;
  legs: { steps?: MbxStep[] }[];
};

async function directions(
  profile: "walking" | "driving" | "driving-traffic" | "cycling",
  from: LngLat,
  to: LngLat,
  opts: { steps?: boolean; language?: string; overview?: "full" | "false" } = {},
): Promise<MbxRoute | null> {
  const params = new URLSearchParams({
    geometries: "polyline", // precision 5, same encoding the app already uses
    overview: opts.overview ?? "full",
    steps: opts.steps ? "true" : "false",
    language: opts.language ?? "en",
  });
  const res = await mapboxFetch(
    `/directions/v5/mapbox/${profile}/${coordPair(from)};${coordPair(to)}?${params}`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    setLastMapsError({ status: res.status, text });
    log.error(`directions ${profile} failed`, undefined, { status: res.status, body: text });
    return null;
  }
  const json = (await res.json()) as { code?: string; routes?: MbxRoute[] };
  if (json.code !== "Ok" || !json.routes?.[0]) {
    setLastMapsError({ status: res.status, text: `No route: ${json.code}` });
    return null;
  }
  return json.routes[0];
}

export type WalkSegment = {
  durationSec: number;
  distanceMeters: number;
  polyline: string; // encoded
};

export async function walkingRoute(from: LngLat, to: LngLat): Promise<WalkSegment | null> {
  try {
    const r = await directions("walking", from, to);
    if (!r) return null;
    return {
      durationSec: Math.round(r.duration),
      distanceMeters: Math.round(r.distance),
      polyline: r.geometry ?? "",
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

function bearing(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Map Mapbox maneuver type + modifier onto the Google-style keys the UI
 * dictionaries already translate (walk.maneuver.turn left, fork right, ...).
 */
export function toManeuverKey(type: string, modifier?: string): string {
  const side = modifier?.includes("left") ? "LEFT" : modifier?.includes("right") ? "RIGHT" : "";
  switch (type) {
    case "depart":
      return "DEPART";
    case "arrive":
      return "ARRIVE";
    case "merge":
      return "MERGE";
    case "fork":
      return side ? `FORK_${side}` : "STRAIGHT";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
    case "exit roundabout":
    case "exit rotary":
      return `ROUNDABOUT_${side || "RIGHT"}`;
    case "new name":
      return "NAME_CHANGE";
    default:
      break;
  }
  switch (modifier) {
    case "uturn":
      return "UTURN_LEFT";
    case "sharp left":
      return "TURN_SHARP_LEFT";
    case "sharp right":
      return "TURN_SHARP_RIGHT";
    case "slight left":
      return "TURN_SLIGHT_LEFT";
    case "slight right":
      return "TURN_SLIGHT_RIGHT";
    case "left":
      return "TURN_LEFT";
    case "right":
      return "TURN_RIGHT";
    default:
      return "STRAIGHT";
  }
}

export async function walkingDirections(
  from: LngLat,
  to: LngLat,
  languageCode: string = "en",
): Promise<WalkDirections | null> {
  try {
    const r = await directions("walking", from, to, { steps: true, language: languageCode });
    if (!r) return null;
    const rawSteps = r.legs.flatMap((l) => l.steps ?? []);
    const steps: WalkStep[] = rawSteps.map((s) => {
      const pts = s.geometry ? polyline.decode(s.geometry) : [];
      const start = { lat: s.maneuver.location[1], lng: s.maneuver.location[0] };
      const lastPt = pts[pts.length - 1];
      const end = lastPt ? { lat: lastPt[0], lng: lastPt[1] } : start;
      return {
        instruction: (s.maneuver.instruction ?? "Continue").replace(/<[^>]+>/g, ""),
        distanceMeters: Math.round(s.distance),
        durationSec: Math.round(s.duration),
        start,
        end,
        maneuver: toManeuverKey(s.maneuver.type, s.maneuver.modifier),
        polyline: s.geometry ?? "",
        heading: bearing(start, end),
      };
    });
    return {
      durationSec: Math.round(r.duration),
      distanceMeters: Math.round(r.distance),
      polyline: r.geometry ?? "",
      steps,
    };
  } catch (e) {
    log.warn("walkingDirections failed", { ...serializeError(e) });
    return null;
  }
}

/** Live drive ETA from Mapbox driving-traffic.
 *  `staticDurationSec` is Mapbox's `duration_typical` (usual conditions for
 *  this time of week). Google's equivalent was free-flow, so the delay we
 *  derive now reads "worse than usual", which is what riders care about. */
export async function drivingRoute(
  from: LngLat,
  to: LngLat,
): Promise<{
  durationSec: number;
  staticDurationSec: number;
  distanceMeters: number;
} | null> {
  try {
    const r = await directions("driving-traffic", from, to, { overview: "false" });
    if (!r) return null;
    const live = Math.round(r.duration);
    const typical = Math.round(r.duration_typical ?? r.duration);
    return { durationSec: live, staticDurationSec: typical, distanceMeters: Math.round(r.distance) };
  } catch (e) {
    log.warn("drivingRoute failed", { ...serializeError(e) });
    return null;
  }
}
