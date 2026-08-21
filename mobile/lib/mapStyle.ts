/// <reference types="google.maps" />
// Aloya's limestone map skin plus the palette the overlays draw with.
// Shared by every web map so a route line on the trip screen is the exact
// same aegean as the one on the home map.

export const LIMESTONE = "#F6F1E7";
export const INK = "#1F1E18";
export const AEGEAN = "#3F9BB2";
export const AEGEAN_DEEP = "#1F6C82";
export const OCHRE = "#C9853A";
export const OLIVE = "#3F4A36";

export type MapTone = "aegean" | "ochre" | "olive" | "ink";

export const TONE: Record<MapTone, string> = {
  aegean: AEGEAN,
  ochre: OCHRE,
  olive: OLIVE,
  ink: INK,
};

export const SEV_FILL: Record<"low" | "medium" | "high", string> = {
  low: "#e0b23a",
  medium: "#c86a1f",
  high: "#a1211c",
};

export const SEV_HALO: Record<"low" | "medium" | "high", string> = {
  low: "rgba(224,178,58,0.22)",
  medium: "rgba(200,106,31,0.24)",
  high: "rgba(161,33,28,0.28)",
};

export const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f3ede1" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a5246" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f3ede1" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dde6cf" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#c9bea4" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e8c478" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bcd9d8" }] },
];
