import type { MapMarker } from "@/components/map/types";

export const TONE_COLOR: Record<NonNullable<MapMarker["tone"]>, string> = {
  aegean: "#2d8a9e",
  ochre: "#d99645",
  olive: "#7d9b76",
  ink: "#2a261f",
};

/** Fill colour and radius (px) for a marker, honouring origin/destination emphasis. */
export function markerStyle(mk: MapMarker): { color: string; radius: number } {
  if (mk.kind === "origin") return { color: "#2a261f", radius: 7 };
  if (mk.kind === "destination") return { color: "#d99645", radius: 7 };
  return { color: TONE_COLOR[mk.tone ?? "aegean"], radius: 5.5 };
}

/** Mapbox zoom runs one level below Google's for the same view (512px tiles). */
export const GOOGLE_TO_MAPBOX_ZOOM = -1;
