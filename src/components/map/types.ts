export type MapMarker = {
  lat: number;
  lng: number;
  label?: string;
  tone?: "aegean" | "ochre" | "olive" | "ink";
  /** "bounds": not drawn, only included when fitting the view (DOM pins). */
  kind?: "origin" | "destination" | "stop" | "pin" | "next" | "bounds";
};

/** One leg of a journey drawn on the map. */
export type MapSegment = {
  kind: "ride" | "walk";
  /** #rrggbb line colour (rides); walks draw dotted white. */
  color: string;
  coords: { lat: number; lng: number }[];
};
