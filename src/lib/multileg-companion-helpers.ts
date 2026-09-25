// Helpers for MultiLegCompanion: map marker generation, dual-vehicle restriction,
// early-alight thresholding, and walk banner titling.

import type { ActiveTrip } from "@/lib/trip-store";
import type { MapMarker } from "@/components/MapPreview";
import type { DictKey } from "@/lib/i18n";
import { distanceM } from "@/lib/geo";

export const EARLY_ALIGHT_THRESHOLD_M = 150;

/**
 * Builds the origin, destination, and transfer stop pins for the multi-leg route.
 */
export function buildMultiLegMapMarkers(
  active: ActiveTrip,
  itin: NonNullable<ActiveTrip["itinerary"]>,
): MapMarker[] {
  const out: MapMarker[] = [];
  out.push({
    lat: active.from.lat,
    lng: active.from.lng,
    kind: "origin",
    label: active.from.label,
  });
  out.push({
    lat: active.to.lat,
    lng: active.to.lng,
    kind: "destination",
    label: active.to.label,
  });

  // Drop a pin at every board + alight stop so the rider sees the chain.
  for (const leg of itin.legs) {
    if (leg.kind === "ride") {
      out.push({
        lat: leg.board.lat,
        lng: leg.board.lng,
        kind: "stop",
        label: leg.board.name,
        tone: "aegean",
      });
      out.push({
        lat: leg.alight.lat,
        lng: leg.alight.lng,
        kind: "stop",
        label: leg.alight.name,
        tone: "ochre",
      });
    }
  }
  return out;
}

/**
 * Derives trip IDs to highlight on the map (current ride + connecting bus during transfer).
 */
export function getRestrictTripIds(
  currentRideLeg?: { tripId: string } | null,
  nextRideLeg?: { tripId: string } | null,
  phase?: string,
): string[] | undefined {
  const ids: string[] = [];
  if (currentRideLeg) ids.push(currentRideLeg.tripId);
  if (
    nextRideLeg &&
    (phase === "walking-to-transfer" || phase === "waiting-for-connection")
  ) {
    ids.push(nextRideLeg.tripId);
  }
  return ids.length > 0 ? ids : undefined;
}

/**
 * Determines whether the user pressed "I'm off" prematurely (far from scheduled alight stop).
 */
export function isEarlyAlight(
  fix: { lat: number; lng: number } | null | undefined,
  alight: { lat: number; lng: number } | null | undefined,
  thresholdM = EARLY_ALIGHT_THRESHOLD_M,
): boolean {
  if (!fix || !alight) return false;
  const dist = distanceM(fix, { lat: alight.lat, lng: alight.lng });
  return dist > thresholdM;
}

/**
 * Returns the localized title for walk guidance banners based on journey phase.
 */
export function getWalkBannerTitle(
  phase: string,
  nextRouteShort: string | undefined,
  t: (key: DictKey, args?: Record<string, string | number>) => string,
): string {
  if (phase === "walking-to-board") return t("ml.walk.toFirst");
  if (phase === "walking-to-transfer") return t("ml.walk.toBus", { code: nextRouteShort ?? "" });
  if (phase === "walking-to-destination") return t("ml.walk.toDest");
  return t("ml.walk.generic");
}
