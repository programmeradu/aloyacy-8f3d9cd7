/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
import { distanceM as haversineM } from "@aloya/core/geo";
import { vehicleOverlayKey } from "@aloya/core/path-geometry";
import type { LatLng, MapVehicle } from "@aloya/core/map-vehicles";
import { AnimatedBus } from "@/components/map/AnimatedBus";

/** A bus within this distance of a stop marker pulses that marker. */
const STOP_PULSE_RADIUS_M = 30;
/** A ping older than this reads as stale and the bus is dimmed. */
const STALE_PING_SEC = 90;
/** Cap on simultaneously animated overlays in a wide fleet view. */
const FLEET_LIMIT = 40;

type Options = {
  api: typeof google | null | undefined;
  mapRef: React.RefObject<google.maps.Map | null>;
  /** Stop markers currently on the map, pulsed when a bus is boarding. */
  markersRef: React.RefObject<{ markers: google.maps.Marker[] }>;
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
    const sizePx = focused ? 64 : restricted ? 48 : 16;
    // Premium top-down bus asset only for focused/restricted close-ups. Wide
    // fleet views use lightweight directional triangles so the map stays legible.
    const variant: "premium" | "triangle" = focused || restricted ? "premium" : "triangle";

    for (const v of slice) {
      const overlayKey = vehicleOverlayKey(v);
      seen.add(overlayKey);
      const existing = layer.get(overlayKey);
      const bearing = v.bearing ?? 0;
      const path = tripPaths.get(v.tripId) ?? null;
      const ageSec = v.timestamp ? Math.max(0, nowSec - v.timestamp) : 0;
      const stale = ageSec > STALE_PING_SEC;

      if (existing) {
        existing.setVariant(variant);
        existing.setPath(path);
        existing.setSize(sizePx);
        existing.setFocused(focused);
        existing.setStale(stale);
        // Dedupe: only consume a ping fresher than the last one applied.
        // Otherwise the bus continues dead-reckoning between real updates.
        if (!v.timestamp || v.timestamp > existing.getLastTs()) {
          existing.setTarget(v.lat, v.lng, bearing, now, v.speed ?? 0);
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
        pulseStopsUnderBoardingBuses(busLayerRef.current, markersRef.current?.markers ?? []);
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
  stopMarkers: google.maps.Marker[],
) {
  if (!stopMarkers.length) return;
  const active = new Set<google.maps.Marker>();
  buses.forEach((b) => {
    if (!b.isBoarding()) return;
    const pos = b.getPos();
    for (const mk of stopMarkers) {
      const p = mk.getPosition();
      if (!p) continue;
      if (haversineM(pos, { lat: p.lat(), lng: p.lng() }) < STOP_PULSE_RADIUS_M) active.add(mk);
    }
  });
  for (const mk of stopMarkers) {
    const on = active.has(mk);
    const flagged = mk as unknown as { __pulse?: boolean };
    if (on === !!flagged.__pulse) continue;
    flagged.__pulse = on;
    const icon = mk.getIcon() as google.maps.Symbol | undefined;
    if (icon && typeof icon === "object" && "scale" in icon) {
      mk.setIcon({ ...icon, scale: on ? (icon.scale ?? 6) * 1.6 : (icon.scale ?? 6) / 1.6 });
    }
  }
}
