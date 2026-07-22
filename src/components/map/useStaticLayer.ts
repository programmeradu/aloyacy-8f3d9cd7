/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
import * as markerClustererPkg from "@googlemaps/markerclusterer";
import type { MarkerClusterer as MarkerClustererType } from "@googlemaps/markerclusterer";
import { clusterIcon, markerIcon } from "@/components/map/mapSymbols";
import type { MapMarker } from "@/components/map/types";

const { MarkerClusterer, SuperClusterAlgorithm } = markerClustererPkg;

/** Below this many stops, clustering hides more than it helps. */
const CLUSTER_THRESHOLD = 12;
const FIT_PADDING = { top: 40, bottom: 40, left: 40, right: 40 };

type Options = {
  api: typeof google | null | undefined;
  mapRef: React.RefObject<google.maps.Map | null>;
  polyline?: string;
  markers?: MapMarker[];
  fitToContent?: boolean;
  /** Single-route or single-trip view: never fold stops into clusters. */
  suppressClustering: boolean;
};

/**
 * Draws the route polyline and the stop/anchor markers, and fits the viewport
 * to them. Returns the layer ref so the bus overlay can pulse stop markers.
 */
export function useStaticLayer({
  api,
  mapRef,
  polyline,
  markers,
  fitToContent,
  suppressClustering,
}: Options) {
  const layerRef = useRef<{
    polyline?: google.maps.Polyline;
    markers: google.maps.Marker[];
    clusterer?: MarkerClustererType;
  }>({ markers: [] });

  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;
    const layer = layerRef.current;

    layer.polyline?.setMap(null);
    // Tear the clusterer down first so its managed markers detach cleanly.
    layer.clusterer?.clearMarkers();
    layer.clusterer?.setMap(null);
    layer.clusterer = undefined;
    layer.markers.forEach((mk) => mk.setMap(null));
    layer.markers = [];

    const bounds = new api.maps.LatLngBounds();
    let hasBounds = false;

    if (polyline) {
      const path = api.maps.geometry.encoding.decodePath(polyline);
      layer.polyline = new api.maps.Polyline({
        path,
        strokeColor: "#1c5566",
        strokeOpacity: 0.95,
        strokeWeight: 4,
        map: m,
      });
      path.forEach((p) => {
        bounds.extend(p);
        hasBounds = true;
      });
    }

    // Anonymous "stop" pins are clusterable; origin/destination/pin markers are
    // anchors the rider must always be able to see.
    const clusterable: google.maps.Marker[] = [];

    (markers ?? []).forEach((mk) => {
      const isStop = !mk.kind || mk.kind === "stop";
      const marker = new api.maps.Marker({
        position: { lat: mk.lat, lng: mk.lng },
        // Clustered markers get attached by the clusterer; anchors render directly.
        map: isStop ? undefined : m,
        title: mk.label,
        icon: markerIcon(mk),
        zIndex: mk.kind === "origin" || mk.kind === "destination" ? 100 : 50,
      });
      layer.markers.push(marker);
      if (isStop) clusterable.push(marker);
      bounds.extend(marker.getPosition()!);
      hasBounds = true;
    });

    // Clustering is for dense fleet/overview maps. On a single-route view or an
    // inline trip preview the rider expects every stop on the line — folding
    // them into anonymous "5" / "7" bubbles is confusing.
    if (clusterable.length >= CLUSTER_THRESHOLD && !suppressClustering) {
      layer.clusterer = new MarkerClusterer({
        map: m,
        markers: clusterable,
        algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 15 }),
        renderer: {
          render: ({ count, position }) =>
            new api.maps.Marker({
              position,
              icon: clusterIcon(count),
              label: {
                text: String(count),
                color: "#f6f1e4",
                fontFamily: "Geist, system-ui, sans-serif",
                fontSize: "12px",
                fontWeight: "600",
              },
              zIndex: 60,
            }),
        },
      });
    } else {
      clusterable.forEach((mk) => mk.setMap(m));
    }

    const shouldFit = fitToContent ?? hasBounds;
    if (shouldFit && hasBounds) m.fitBounds(bounds, FIT_PADDING);
    // markers is compared by value: parents rebuild the array every render.
  }, [api, polyline, JSON.stringify(markers), fitToContent, suppressClustering]); // eslint-disable-line react-hooks/exhaustive-deps

  return layerRef;
}
