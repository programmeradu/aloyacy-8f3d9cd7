import type { MapMarker } from "@/components/map/types";

export const TONE_COLOR: Record<NonNullable<MapMarker["tone"]>, string> = {
  aegean: "#ffffff",
  ochre: "#F6B83C",
  olive: "#d9d9d5",
  ink: "#171717",
};

/** Fill colour and radius (px) for a marker, honouring origin/destination emphasis. */
export function markerStyle(mk: MapMarker): { color: string; radius: number } {
  if (mk.kind === "origin") return { color: "#171717", radius: 7 };
  if (mk.kind === "destination") return { color: "#F6B83C", radius: 7 };
  return { color: TONE_COLOR[mk.tone ?? "aegean"], radius: 5.5 };
}

/** Mapbox zoom runs one level below Google's for the same view (512px tiles). */
export const GOOGLE_TO_MAPBOX_ZOOM = -1;
