// Basemap switch for every map in the app (Roam redesign, Oct 2026).
//
// ONE place to change the map imagery. Set BASEMAP to:
//   "esri"            Esri World Imagery raster tiles (aerial). NOT licensed for
//                     production use without an Esri/ArcGIS agreement; shipped for
//                     this milestone with the required on-screen attribution.
//   "mapbox-satellite" Mapbox Satellite, covered by the app's existing Mapbox token
//                     and terms. Swap to this (or MapTiler) for production.
//   "maptiler"        MapTiler Satellite; needs VITE_MAPTILER_KEY.
//   "light"           The previous Mapbox Light style with the Aloya tint.
// Attribution is rendered by MapAttribution for every option.

export type BasemapId = "esri" | "mapbox-satellite" | "maptiler" | "light";

export const BASEMAP: BasemapId = "esri";

type RasterStyle = {
  version: 8;
  sources: Record<string, unknown>;
  layers: unknown[];
  glyphs?: string;
};

/** Darker, slightly desaturated grade so white pins, yellow routes and frosted
 *  controls read on top (matches the concept's graded imagery). */
const GRADE = {
  "raster-saturation": -0.3,
  "raster-brightness-max": 0.8,
  "raster-contrast": 0.06,
  "raster-fade-duration": 200,
};

function raster(tiles: string[], tileSize: number, maxzoom: number): RasterStyle {
  return {
    version: 8,
    sources: { aerial: { type: "raster", tiles, tileSize, maxzoom } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#3b3d38" } },
      { id: "aerial", type: "raster", source: "aerial", paint: GRADE },
    ],
  };
}

export function basemapStyle(id: BasemapId = BASEMAP): string | RasterStyle {
  switch (id) {
    case "esri":
      return raster(
        [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        256,
        19,
      );
    case "maptiler": {
      const key = (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? "";
      return raster(
        [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${key}`],
        512,
        20,
      );
    }
    case "mapbox-satellite":
      return "mapbox://styles/mapbox/satellite-v9";
    default:
      return "mapbox://styles/mapbox/light-v11";
  }
}

export function isAerial(id: BasemapId = BASEMAP) {
  return id !== "light";
}

/** Attribution the provider requires on screen, shown by MapAttribution. */
export function basemapAttribution(id: BasemapId = BASEMAP): { text: string; href: string }[] {
  switch (id) {
    case "esri":
      return [
        { text: "Powered by Esri", href: "https://www.esri.com/" },
        {
          text: "Imagery © Esri, Maxar, Earthstar Geographics",
          href: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
        },
      ];
    case "maptiler":
      return [
        { text: "© MapTiler", href: "https://www.maptiler.com/copyright/" },
        { text: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" },
      ];
    default:
      return [
        { text: "© Mapbox", href: "https://www.mapbox.com/about/maps/" },
        { text: "© OpenStreetMap", href: "https://www.openstreetmap.org/copyright" },
      ];
  }
}
