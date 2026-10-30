export type MapMarker = {
  lat: number;
  lng: number;
  label?: string;
  tone?: "aegean" | "ochre" | "olive" | "ink";
  /** "bounds": not drawn, only included when fitting the view (DOM pins). */
  kind?: "origin" | "destination" | "stop" | "pin" | "next" | "bounds";
};
