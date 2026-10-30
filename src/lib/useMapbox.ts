// Loader hook for Mapbox GL JS (v3). Client only: the library is imported
// lazily so it never runs during SSR and stays out of the first bundle.
// Replaced the Google Maps JS loader in Oct 2026.
import { useCallback, useEffect, useState } from "react";
import type mapboxglType from "mapbox-gl";
import type { Map as MapboxMap } from "mapbox-gl";
import { isChunkLoadError, reloadForNewDeploy } from "@/lib/staleDeploy";

export type MapboxApi = typeof mapboxglType;

let tokenOverride: string | null = null;
export function setMapboxTokenOverride(token: string | null) {
  tokenOverride = token;
}

export function getMapboxToken(): string {
  if (tokenOverride !== null) return tokenOverride;
  return (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? "";
}

let loader: Promise<MapboxApi> | null = null;

function load(): Promise<MapboxApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const token = getMapboxToken();
  if (!token) return Promise.reject(new Error("missing mapbox token"));
  if (!loader) {
    const fetchLib = () =>
      Promise.all([import("mapbox-gl"), import("mapbox-gl/dist/mapbox-gl.css")]);
    loader = fetchLib()
      // One retry covers a dropped connection; a chunk that 404s because a new
      // deploy renamed it needs a reload of the page (see staleDeploy.ts).
      .catch(() => new Promise((r) => setTimeout(r, 600)).then(fetchLib))
      .then(([mod]) => {
        const mapboxgl = ((mod as unknown as { default?: MapboxApi }).default ?? mod) as MapboxApi;
        mapboxgl.accessToken = token;
        return mapboxgl;
      })
      .catch((e) => {
        loader = null;
        if (isChunkLoadError(e)) reloadForNewDeploy();
        throw e;
      });
  }
  return loader;
}

export function useMapbox() {
  const [api, setApi] = useState<MapboxApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (api) return;
    let cancelled = false;
    load()
      .then((m) => {
        if (cancelled) return;
        setError(null);
        setApi(() => m);
      })
      .catch((e) => !cancelled && setError(e?.message ?? String(e)));
    return () => {
      cancelled = true;
    };
  }, [api, nonce]);
  const retry = useCallback(() => {
    setError(null);
    setNonce((n) => n + 1);
  }, []);
  return { api, error, retry };
}

/** Base style. Mapbox Light keeps labels legible; we re-tint it to the Aloya
 *  limestone palette on load (see applyAloyaTint). */
export const ALOYA_MAP_STYLE_URL = "mapbox://styles/mapbox/light-v11";

/** Re-tint Mapbox Light to the Aloya editorial palette (limestone land,
 *  muted aqua water, olive parks, white roads, ochre motorways) and hide POI
 *  and transit clutter. Layer ids are matched by pattern so minor style
 *  updates from Mapbox do not break it. */
export function applyAloyaTint(map: MapboxMap) {
  const style = map.getStyle();
  if (!style?.layers) return;
  const set = (id: string, prop: string, value: unknown) => {
    try {
      map.setPaintProperty(id, prop as never, value as never);
    } catch {
      /* layer type does not support this property */
    }
  };
  for (const layer of style.layers) {
    const id = layer.id;
    if (layer.type === "background" || id === "land") set(id, "background-color", "#f3ede1");
    else if (/^water/.test(id) && layer.type === "fill") set(id, "fill-color", "#bcd9d8");
    else if (/park|landuse|national-park|pitch/.test(id) && layer.type === "fill")
      set(id, "fill-color", "#dde6cf");
    else if (/motorway|trunk/.test(id) && layer.type === "line" && !/case/.test(id))
      set(id, "line-color", "#e8c478");
    else if (/road|street|bridge|tunnel/.test(id) && layer.type === "line" && !/case/.test(id))
      set(id, "line-color", "#ffffff");
    else if (/case/.test(id) && layer.type === "line") set(id, "line-color", "#d8cdb3");

    if (/poi-label|transit-label|airport-label|ferry|rail|transit/.test(id)) {
      try {
        map.setLayoutProperty(id, "visibility", "none");
      } catch {
        /* ignore */
      }
    }
    if (layer.type === "symbol" && /label/.test(id)) {
      set(id, "text-color", "#5a5246");
      set(id, "text-halo-color", "#f3ede1");
    }
  }
}
