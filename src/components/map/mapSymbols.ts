/// <reference types="google.maps" />

import type { MapMarker } from "@/components/map/types";

export const TONE_COLOR: Record<NonNullable<MapMarker["tone"]>, string> = {
  aegean: "#2d8a9e",
  ochre: "#d99645",
  olive: "#7d9b76",
  ink: "#2a261f",
};

/** Simple ringed dot used for stops and trip anchors. */
export function dot(color: string, size = 11, ring = 3): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: ring,
    scale: size / 2,
  };
}

/** Editorial cluster bubble — aegean fill, limestone ring, grows with count. */
export function clusterIcon(count: number): google.maps.Symbol {
  // Bubble grows logarithmically so 20 and 200 don't render at the same size.
  const scale = 13 + Math.min(10, Math.log2(Math.max(2, count)) * 2.5);
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: "#1c5566",
    fillOpacity: 0.92,
    strokeColor: "#f6f1e4",
    strokeWeight: 3,
    scale,
  };
}

/** Icon for a marker, honouring the origin/destination emphasis. */
export function markerIcon(mk: MapMarker): google.maps.Symbol {
  if (mk.kind === "origin") return dot("#2a261f", 14, 3);
  if (mk.kind === "destination") return dot("#d99645", 14, 3);
  return dot(TONE_COLOR[mk.tone ?? "aegean"], 11, 3);
}
