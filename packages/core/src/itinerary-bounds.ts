// Pure map-framing math for itineraries. Shared by web and mobile so the
// two companions frame the same journey from one implementation.
//
// The two platforms historically measured the extent differently (web took
// the larger axis, mobile the NW–SE diagonal), so both measures live here
// behind an option instead of being re-forked per platform.

import { distanceM } from "./geo";
import type { Itinerary, Leg } from "./itinerary-types";

export type LatLng = { lat: number; lng: number };
export type Bounds = { center: LatLng; spanKm: number };

export type BoundsOptions = {
  /** "axis" = larger of the lat/lng extents; "diagonal" = corner-to-corner. */
  measure?: "axis" | "diagonal";
  /** Multiplier applied to the raw extent so markers are not flush to the edge. */
  padding?: number;
  /** Floor so a very short trip never zooms to street level. */
  minSpanKm?: number;
  /** Ceiling so an island-long trip stays legible. */
  maxSpanKm?: number;
  /** Used when the itinerary carries no positioned legs at all. */
  fallback?: Bounds;
};

const KM_PER_DEG_LAT = 111;
/** Cyprus sits near 35°N, so a degree of longitude is ~95 km there. */
const KM_PER_DEG_LNG = 95;

export const DEFAULT_BOUNDS_OPTIONS: Required<Omit<BoundsOptions, "fallback">> & {
  fallback: Bounds;
} = {
  measure: "axis",
  padding: 1.3,
  minSpanKm: 1.5,
  maxSpanKm: Infinity,
  fallback: { center: { lat: 35.17, lng: 33.36 }, spanKm: 4 },
};

/** Every positioned point a leg touches, in travel order. */
export function legPoints(leg: Leg): LatLng[] {
  if (leg.kind === "ride") {
    return [
      { lat: leg.board.lat, lng: leg.board.lng },
      { lat: leg.alight.lat, lng: leg.alight.lng },
    ];
  }
  if (leg.kind === "walk") {
    return [
      { lat: leg.from.lat, lng: leg.from.lng },
      { lat: leg.to.lat, lng: leg.to.lng },
    ];
  }
  return [{ lat: leg.lat, lng: leg.lng }];
}

/** Centre + span (km) that frames every leg of an itinerary. */
export function boundsForItinerary(
  it: Pick<Itinerary, "legs">,
  options: BoundsOptions = {},
): Bounds {
  const { measure, padding, minSpanKm, maxSpanKm, fallback } = {
    ...DEFAULT_BOUNDS_OPTIONS,
    ...options,
  };

  const pts = it.legs
    .flatMap(legPoints)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length === 0) return fallback;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const rawKm =
    measure === "diagonal"
      ? distanceM({ lat: maxLat, lng: minLng }, { lat: minLat, lng: maxLng }) / 1000
      : Math.max((maxLat - minLat) * KM_PER_DEG_LAT, (maxLng - minLng) * KM_PER_DEG_LNG);

  const spanKm = Math.min(maxSpanKm, Math.max(minSpanKm, rawKm * padding));
  return { center, spanKm };
}

/** Mobile preset: diagonal measure, 1–60 km, Nicosia fallback. */
export function boundsForItineraryNative(it: Pick<Itinerary, "legs">): Bounds {
  return boundsForItinerary(it, {
    measure: "diagonal",
    padding: 1.2,
    minSpanKm: 1,
    maxSpanKm: 60,
  });
}
