import type { MapMarker } from "@/components/map/types";

export const TONE_COLOR: Record<NonNullable<MapMarker["tone"]>, string> = {
  aegean: "#ffffff",
  ochre: "#F6B83C",
  olive: "#d9d9d5",
  ink: "#171717",
};

export type MarkerPaint = { color: string; radius: number; stroke: string; strokeWidth: number };

/**
 * Paint for a marker (Roam): terminals are bold discs (dark origin, yellow
 * destination) with a white rim; the next stop is a white disc ringed in
 * yellow; plain stops are small white rings with a dark edge that sit on the
 * yellow route line and stay legible on aerial imagery.
 */
export function markerStyle(mk: MapMarker): MarkerPaint {
  if (mk.kind === "origin") return { color: "#171717", radius: 7, stroke: "#ffffff", strokeWidth: 3 };
  if (mk.kind === "destination")
    return { color: "#F6B83C", radius: 8, stroke: "#ffffff", strokeWidth: 3 };
  if (mk.kind === "next") return { color: "#ffffff", radius: 6.5, stroke: "#F6B83C", strokeWidth: 4 };
  const color = TONE_COLOR[mk.tone ?? "aegean"];
  return { color, radius: 4, stroke: color === "#ffffff" ? "#1f1f1c" : "#ffffff", strokeWidth: 2 };
}

/** Mapbox zoom runs one level below Google's for the same view (512px tiles). */
export const GOOGLE_TO_MAPBOX_ZOOM = -1;
