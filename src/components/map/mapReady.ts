import type mapboxgl from "mapbox-gl";

/** Run `fn` once the map style is ready (immediately when it already is). */
export function whenStyleReady(map: mapboxgl.Map, fn: () => void): () => void {
  if (map.isStyleLoaded()) {
    fn();
    return () => {};
  }
  let done = false;
  const handler = () => {
    if (done || !map.isStyleLoaded()) return;
    done = true;
    map.off("styledata", handler);
    map.off("load", handler);
    fn();
  };
  map.on("styledata", handler);
  map.on("load", handler);
  return () => {
    done = true;
    map.off("styledata", handler);
    map.off("load", handler);
  };
}
