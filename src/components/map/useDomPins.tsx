// React-rendered DOM pins on a Mapbox map (Roam stop pins, chevrons, labels).
// Each pin gets a Marker element; its React content is portalled into it.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type mapboxgl from "mapbox-gl";
import type { MapboxApi } from "@/lib/useMapbox";

export type DomPin = {
  id: string;
  lat: number;
  lng: number;
  node: ReactNode;
  anchor?: "center" | "bottom";
  /** Higher wins when two pins overlap on screen (declutter). */
  priority?: number;
};

/** Hide lower-priority pins closer than `px` on screen to a kept one. */
function declutter(
  map: mapboxgl.Map,
  pins: DomPin[],
  els: Map<string, { el: HTMLElement }>,
  px: number,
) {
  const kept: { x: number; y: number }[] = [];
  const order = [...pins].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const p of order) {
    const el = els.get(p.id)?.el;
    if (!el) continue;
    const pt = map.project([p.lng, p.lat]);
    const clash = kept.some((k) => Math.abs(k.x - pt.x) < px && Math.abs(k.y - pt.y) < px);
    el.classList.toggle("r-pin-hidden", clash);
    if (!clash) kept.push({ x: pt.x, y: pt.y });
  }
}

export function useDomPins(
  api: MapboxApi | null,
  mapRef: RefObject<mapboxgl.Map | null>,
  pins: DomPin[] | undefined,
  declutterPx = 0,
) {
  const markers = useRef(new Map<string, { m: mapboxgl.Marker; el: HTMLElement }>());
  const [, bump] = useState(0);
  const key = (pins ?? []).map((p) => `${p.id}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`).join("|");

  useEffect(() => {
    const map = mapRef.current;
    if (!api || !map) return;
    const next = new Set((pins ?? []).map((p) => p.id));
    for (const [id, v] of markers.current) {
      if (!next.has(id)) {
        v.m.remove();
        markers.current.delete(id);
      }
    }
    for (const p of pins ?? []) {
      const have = markers.current.get(p.id);
      if (have) {
        have.m.setLngLat([p.lng, p.lat]);
        continue;
      }
      const el = document.createElement("div");
      const m = new api.Marker({ element: el, anchor: p.anchor ?? "center" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      markers.current.set(p.id, { m, el });
    }
    bump((n) => n + 1);
    // key stands in for the pins array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, mapRef, key]);

  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  useEffect(() => {
    const map = mapRef.current;
    if (!api || !map || !declutterPx) return;
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => declutter(map, pinsRef.current ?? [], markers.current, declutterPx));
    };
    run();
    map.on("zoomend", run);
    map.on("moveend", run);
    return () => {
      cancelAnimationFrame(raf);
      map.off("zoomend", run);
      map.off("moveend", run);
    };
  }, [api, mapRef, key, declutterPx]);

  useEffect(
    () => () => {
      for (const v of markers.current.values()) v.m.remove();
      markers.current.clear();
    },
    [],
  );

  return (pins ?? []).map((p) => {
    const el = markers.current.get(p.id)?.el;
    return el ? createPortal(p.node, el, p.id) : null;
  });
}
