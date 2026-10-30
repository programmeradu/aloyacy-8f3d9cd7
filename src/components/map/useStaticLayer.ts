import { useEffect, useRef } from "react";
import type mapboxgl from "mapbox-gl";
import { decodePolyline } from "@aloya/core/shapes";
import { markerStyle } from "@/components/map/mapSymbols";
import { whenStyleReady } from "@/components/map/mapReady";
import type { MapMarker } from "@/components/map/types";
import type { MapboxApi } from "@/lib/useMapbox";

/** Below this many stops, clustering hides more than it helps. */
const CLUSTER_THRESHOLD = 12;
const FIT_PADDING = 40;

export const STOPS_SOURCE = "aloya-stops";
const ROUTE_SOURCE = "aloya-route";
const ANCHOR_SOURCE = "aloya-anchors";
const LAYERS = [
  "aloya-route-line",
  "aloya-route-casing",
  "aloya-clusters",
  "aloya-cluster-count",
  "aloya-stop-dots",
  "aloya-anchor-dots",
];

export type StaticLayerState = {
  map: mapboxgl.Map | null;
  /** Rendered stop markers (feature id = index), pulsed by the bus layer. */
  stops: { id: number; lat: number; lng: number }[];
};

type Options = {
  api: MapboxApi | null | undefined;
  mapRef: React.RefObject<mapboxgl.Map | null>;
  polyline?: string;
  markers?: MapMarker[];
  fitToContent?: boolean;
  /** Single-route or single-trip view: never fold stops into clusters. */
  suppressClustering: boolean;
};

function clear(map: mapboxgl.Map) {
  for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of [ROUTE_SOURCE, STOPS_SOURCE, ANCHOR_SOURCE]) if (map.getSource(id)) map.removeSource(id);
}

/**
 * Draws the route polyline and the stop/anchor markers as GeoJSON layers and
 * fits the viewport to them. Returns the layer ref so the bus overlay can
 * pulse stop markers.
 */
export function useStaticLayer({
  api,
  mapRef,
  polyline,
  markers,
  fitToContent,
  suppressClustering,
}: Options) {
  const layerRef = useRef<StaticLayerState>({ map: null, stops: [] });

  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;

    return whenStyleReady(m, () => {
      clear(m);
      layerRef.current = { map: m, stops: [] };
      const bounds = new api.LngLatBounds();
      let hasBounds = false;

      if (polyline) {
        const path = decodePolyline(polyline);
        if (path.length) {
          m.addSource(ROUTE_SOURCE, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: path.map((p) => [p.lng, p.lat]) },
            },
          });
          m.addLayer({
            id: "aloya-route-casing",
            type: "line",
            source: ROUTE_SOURCE,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "rgba(20,20,20,0.35)", "line-width": 8 },
          });
          m.addLayer({
            id: "aloya-route-line",
            type: "line",
            source: ROUTE_SOURCE,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#F6B83C", "line-opacity": 1, "line-width": 4 },
          });
          path.forEach((p) => {
            bounds.extend([p.lng, p.lat]);
            hasBounds = true;
          });
        }
      }

      // Anonymous "stop" pins are clusterable; origin/destination/pin markers
      // are anchors the rider must always be able to see.
      const stopFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
      const anchorFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
      (markers ?? []).forEach((mk, i) => {
        const isStop = !mk.kind || mk.kind === "stop";
        const { color, radius } = markerStyle(mk);
        const f: GeoJSON.Feature<GeoJSON.Point> = {
          type: "Feature",
          id: i,
          properties: { color, radius, label: mk.label ?? "" },
          geometry: { type: "Point", coordinates: [mk.lng, mk.lat] },
        };
        if (isStop) {
          stopFeatures.push(f);
          layerRef.current.stops.push({ id: i, lat: mk.lat, lng: mk.lng });
        } else anchorFeatures.push(f);
        bounds.extend([mk.lng, mk.lat]);
        hasBounds = true;
      });

      const cluster = stopFeatures.length >= CLUSTER_THRESHOLD && !suppressClustering;
      if (stopFeatures.length) {
        m.addSource(STOPS_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: stopFeatures },
          cluster,
          clusterRadius: 40,
          clusterMaxZoom: 14,
        });
        if (cluster) {
          m.addLayer({
            id: "aloya-clusters",
            type: "circle",
            source: STOPS_SOURCE,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#262626",
              "circle-opacity": 0.92,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
              "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 14, 20, 20, 200, 26],
            },
          });
          m.addLayer({
            id: "aloya-cluster-count",
            type: "symbol",
            source: STOPS_SOURCE,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
            },
            paint: { "text-color": "#ffffff" },
          });
        }
        m.addLayer({
          id: "aloya-stop-dots",
          type: "circle",
          source: STOPS_SOURCE,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "pulse"], false],
              ["*", ["get", "radius"], 1.6],
              ["get", "radius"],
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
          },
        });
      }
      if (anchorFeatures.length) {
        m.addSource(ANCHOR_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: anchorFeatures },
        });
        m.addLayer({
          id: "aloya-anchor-dots",
          type: "circle",
          source: ANCHOR_SOURCE,
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["get", "radius"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
          },
        });
      }

      const shouldFit = fitToContent ?? hasBounds;
      if (shouldFit && hasBounds && !bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 16, duration: 0 });
      }
    });
    // markers is compared by value: parents rebuild the array every render.
  }, [api, polyline, JSON.stringify(markers), fitToContent, suppressClustering]); // eslint-disable-line react-hooks/exhaustive-deps

  return layerRef;
}
