import { useEffect, useRef } from "react";
import { distanceM as haversineM } from "@aloya/core/geo";
import { vehicleOverlayKey } from "@aloya/core/path-geometry";
import type { LatLng, MapVehicle } from "@aloya/core/map-vehicles";
import type mapboxgl from "mapbox-gl";
import { AnimatedBus } from "@/components/map/AnimatedBus";
import { STOPS_SOURCE, type StaticLayerState } from "@/components/map/useStaticLayer";
import type { MapboxApi } from "@/lib/useMapbox";
import { getRoute } from "@/lib/gtfs";

/** A bus within this distance of a stop marker pulses that marker. */
const STOP_PULSE_RADIUS_M = 30;
/** A ping older than this reads as stale and the bus is dimmed. */
const STALE_PING_SEC = 90;
/** Cap on simultaneously animated overlays in a wide fleet view. */
const FLEET_LIMIT = 40;

type Options = {
  api: MapboxApi | null | undefined;
  mapRef: React.RefObject<mapboxgl.Map | null>;
  /** Stop markers currently on the map, pulsed when a bus is boarding. */
  markersRef: React.RefObject<StaticLayerState>;
  vehicles: MapVehicle[] | undefined;
  tripPaths: Map<string, LatLng[]>;
  focused: boolean;
  restricted: boolean;
};

/**
 * Premium gliding bus overlay. Each vehicle is its own DOM overlay that tweens
 * position + bearing between feed refreshes on rAF, giving a smooth glide
 * instead of teleporting on each 20s poll. State lives in a ref so animation
 * never depends on React renders.
 */
export function useLiveBusLayer({
  api,
  mapRef,
  markersRef,
  vehicles,
  tripPaths,
  focused,
  restricted,
}: Options) {
  const busLayerRef = useRef<Map<string, AnimatedBus>>(new Map());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;

    const layer = busLayerRef.current;
    const now = performance.now();
    const nowSec = Math.floor(Date.now() / 1000);

    if (!vehicles) {
      // Source went away (e.g. liveVehicles=false) — clear everything.
      layer.forEach((b) => b.destroy());
      layer.clear();
      return;
    }

    const seen = new Set<string>();
    const slice = vehicles.slice(0, focused ? 1 : FLEET_LIMIT);
    const sizePx = focused ? 64 : restricted ? 48 : 24;
    // Close-ups (focused/restricted) get the full-size bus with its line badge;
    // wide fleet views use the same glyph small and badge-free so the map stays legible.
    const variant: "premium" | "triangle" = focused || restricted ? "premium" : "triangle";

    for (const v of slice) {
      const overlayKey = vehicleOverlayKey(v);
      seen.add(overlayKey);
      const existing = layer.get(overlayKey);
      const bearing = v.bearing ?? 0;
      const path = tripPaths.get(v.tripId) ?? null;
      const ageSec = v.timestamp ? Math.max(0, nowSec - v.timestamp) : 0;
      const stale = ageSec > STALE_PING_SEC;
      const badge = variant === "premium" ? (getRoute(v.routeId)?.short ?? null) : null;

      if (existing) {
        existing.setVariant(variant);
        existing.setPath(path);
        existing.setSize(sizePx);
        existing.setFocused(focused);
        existing.setStale(stale);
        existing.setBadge(badge);
        // Dedupe: only consume a ping fresher than the last one applied.
        // Otherwise the bus continues dead-reckoning between real updates.
        if (!v.timestamp || v.timestamp > existing.getLastTs()) {
          existing.setTarget(v.lat, v.lng, bearing, now, v.speed ?? 0, v.timestamp || undefined);
          existing.setLastTs(v.timestamp ?? 0);
        }
      } else {
        const bus = new AnimatedBus(
          api,
          m,
          { lat: v.lat, lng: v.lng },
          bearing,
          sizePx,
          focused,
          v.label || `Bus ${v.id}`,
          variant,
          path,
          stale,
          v.speed ?? 0,
          badge,
        );
        // Record the first ping WITHOUT firing setTarget — that path forces
        // lerp mode + boarding=true (distM=0 against itself), freezing the bus
        // until a second ping arrives. prime() just stores the snapshot so the
        // NEXT genuine ping derives ground speed and goes straight to path mode.
        bus.prime(v.lat, v.lng, bearing, now, v.timestamp ?? 0, v.speed ?? 0);
        layer.set(overlayKey, bus);
      }
    }

    for (const [id, bus] of layer) {
      if (!seen.has(id)) {
        bus.destroy();
        layer.delete(id);
      }
    }

    if (rafRef.current == null && layer.size > 0) {
      const tick = (t: number) => {
        const liveMap = mapRef.current;
        if (!liveMap || busLayerRef.current.size === 0) {
          rafRef.current = null;
          return;
        }
        busLayerRef.current.forEach((b) => b.tick(t));
        pulseStopsUnderBoardingBuses(busLayerRef.current, markersRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [api, vehicles, focused, restricted, tripPaths, mapRef, markersRef]);

  useEffect(() => {
    const layer = busLayerRef.current;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      layer.forEach((b) => b.destroy());
      layer.clear();
    };
  }, []);

  return busLayerRef;
}

/**
 * Any bus that is at a stop (speed≈0, near its tween target) within ~30m of a
 * rendered stop marker enlarges that marker. Cheap O(buses × stops) — both
 * sets are small and capped.
 */
function pulseStopsUnderBoardingBuses(
  buses: Map<string, AnimatedBus>,
  layer: StaticLayerState | null | undefined,
) {
  const map = layer?.map;
  const stops = layer?.stops ?? [];
  if (!map || !stops.length || !map.getSource(STOPS_SOURCE)) return;
  const active = new Set<number>();
  buses.forEach((b) => {
    if (!b.isBoarding()) return;
    const pos = b.getPos();
    for (const st of stops) {
      if (haversineM(pos, st) < STOP_PULSE_RADIUS_M) active.add(st.id);
    }
  });
  const prev = pulsed.get(map) ?? new Set<number>();
  for (const id of prev) {
    if (!active.has(id)) map.setFeatureState({ source: STOPS_SOURCE, id }, { pulse: false });
  }
  for (const id of active) {
    if (!prev.has(id)) map.setFeatureState({ source: STOPS_SOURCE, id }, { pulse: true });
  }
  pulsed.set(map, active);
}

const pulsed = new WeakMap<mapboxgl.Map, Set<number>>();
