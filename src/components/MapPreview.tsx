/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { useGoogleMaps, ALOYA_MAP_STYLE } from "@/lib/useGoogleMaps";
import { IconExpand, IconClose } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { spanToZoom } from "@aloya/core/path-geometry";
import { overrideSignature, selectMapVehicles, type VehicleOverride } from "@aloya/core/map-vehicles";
import { MapDebugPanel } from "@/components/map/MapDebugPanel";
import { useLiveBusLayer } from "@/components/map/useLiveBusLayer";
import { useMapFullscreen } from "@/components/map/useMapFullscreen";
import { useStaticLayer } from "@/components/map/useStaticLayer";
import { useTripPaths } from "@/components/map/useTripPaths";
import { UserHereOverlay } from "@/components/map/UserHereOverlay";
import type { MapMarker } from "@/components/map/types";

export type { MapMarker };

type Props = {
  height?: string;
  center?: { lat: number; lng: number };
  /** Approximate viewport span in km. Used as fallback zoom when no bounds. */
  spanKm?: number;
  /** Encoded polyline (Google polyline algorithm). */
  polyline?: string;
  markers?: MapMarker[];
  /** If true, overlays realtime bus vehicles. Defaults to true. */
  liveVehicles?: boolean;
  /** If set, only the bus matching this tripId is shown (with active styling).
   *  Falls back to routeId match when no tripId matches the feed snapshot. */
  focusTripId?: string;
  focusRouteId?: string;
  /** If set, only render live vehicles whose tripId is in this list.
   *  Use to restrict the map to the buses relevant to a given stop/route. */
  restrictTripIds?: string[];
  /** Override the live position/bearing of specific vehicles by tripId.
   *  Used by the on-board journey to fuse the user's GPS into the bus blip
   *  so the marker glides with the rider's phone instead of the lagging feed. */
  vehicleOverrides?: Record<string, VehicleOverride>;
  /** Override the bottom-left live-count pill label. */
  liveLabel?: { active?: string; empty?: string };
  /** Hide the bottom-left live-count pill (still renders vehicles). */
  hideLiveBadge?: boolean;
  /** Caption shown bottom-right. Defaults to "Cyprus — {spanKm}". */
  placeName?: string;
  /** Fit map to markers + polyline. Defaults to true when any are provided. */
  fitToContent?: boolean;
  /** Render a "you are here" dot (and optional heading cone) for the rider. */
  userLocation?: {
    lat: number;
    lng: number;
    /** Degrees clockwise from north. Null/undefined hides the cone. */
    headingDeg?: number | null;
    /** GPS accuracy in metres; used to size the soft accuracy halo. */
    accuracyM?: number;
  } | null;
  /** Show the expand-to-fullscreen toggle. Defaults to true. */
  fullscreenable?: boolean;
  /** Render a live telemetry overlay listing every animated bus (ping age,
   *  mode, speed, correction). For internal /qa stress testing only. */
  debug?: boolean;
};

export function MapPreview({
  height = "h-64",
  center = NICOSIA_CENTER,
  spanKm = 8,
  polyline,
  markers,
  liveVehicles = true,
  focusTripId,
  focusRouteId,
  restrictTripIds,
  vehicleOverrides,
  liveLabel,
  hideLiveBadge,
  placeName,
  fitToContent,
  userLocation,
  fullscreenable = true,
  debug = false,
}: Props) {
  // placeName is derived from browser geolocation on the client, so the SSR
  // markup ("Cyprus") never matches. Render the badge only after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const { api, error } = useGoogleMaps();
  const { data: rt } = useRealtime();
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const focused = !!(focusTripId || focusRouteId);
  const restricted = !focused && !!(restrictTripIds && restrictTripIds.length);

  // Initialize map once API is ready
  useEffect(() => {
    if (!api || !hostRef.current || mapRef.current) return;
    mapRef.current = new api.maps.Map(hostRef.current, {
      center,
      zoom: spanToZoom(spanKm),
      disableDefaultUI: true,
      gestureHandling: "greedy",
      backgroundColor: "#f3ede1",
      styles: ALOYA_MAP_STYLE,
      clickableIcons: false,
    });
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const { expanded, fallbackOverlay, wrapperRef, toggleFullscreen } = useMapFullscreen(api, mapRef);

  // Update center / zoom when there is no content to fit to.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const hasContent = (polyline && polyline.length > 0) || (markers && markers.length > 0);
    if (fitToContent ?? hasContent) return;
    m.setCenter(center);
    m.setZoom(spanToZoom(spanKm));
    // center.lat/lng are depended on individually so a new object identity from
    // the parent does not re-pan the map on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, spanKm, polyline, markers, fitToContent]);

  const layerRef = useStaticLayer({
    api,
    mapRef,
    polyline,
    markers,
    fitToContent,
    suppressClustering: focused || restricted,
  });

  const allVehicles = liveVehicles ? rt?.vehicles : undefined;
  const restrictKey = restrictTripIds ? restrictTripIds.join(",") : "";
  const overrideKey = overrideSignature(vehicleOverrides);
  const vehicles = useMemo(
    () =>
      selectMapVehicles({
        vehicles: allVehicles,
        overrides: vehicleOverrides,
        focusTripId,
        focusRouteId,
        restrictTripIds,
      }),
    // Keys stand in for the array/object identities so a re-render with the
    // same data does not rebuild every overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVehicles, focusTripId, focusRouteId, restrictKey, overrideKey],
  );

  const tripPaths = useTripPaths(rt);
  const busLayerRef = useLiveBusLayer({
    api,
    mapRef,
    markersRef: layerRef,
    vehicles: liveVehicles ? vehicles : undefined,
    tripPaths,
    focused,
    restricted,
  });

  useUserHereOverlay(api, mapRef, userLocation);

  const liveCount = focused || restricted ? vehicles.length : (rt?.vehicles.length ?? 0);

  // When fullscreen the wrapper already fills the viewport, so the rounded
  // corners + ring would look odd — drop them while expanded.
  const wrapperClass = expanded
    ? fallbackOverlay
      ? "fixed inset-0 z-[2147483000] w-screen h-screen overflow-hidden bg-limestone-soft"
      : "relative w-full h-full overflow-hidden bg-limestone-soft"
    : `relative w-full overflow-hidden rounded-[28px] ring-1 ring-line bg-limestone-soft ${height}`;

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <div ref={hostRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Map unavailable
          </p>
        </div>
      )}
      {liveVehicles && !hideLiveBadge && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-3.5 py-1.5 backdrop-blur-md ring-1 ring-line">
          <span className="font-sans text-[12px] font-semibold tracking-tight text-ink">
            {focused
              ? liveCount
                ? (liveLabel?.active ?? t("map.live.active"))
                : (liveLabel?.empty ?? t("map.live.locating"))
              : restricted
                ? liveCount
                  ? (liveLabel?.active ?? `${liveCount} serving, live`)
                  : (liveLabel?.empty ?? t("map.live.none"))
                : liveCount
                  ? `${liveCount} live`
                  : "Connecting"}
          </span>
        </div>
      )}
      {hydrated && placeName && (
        <div className="pointer-events-none absolute bottom-3 right-3 max-w-[65%] rounded-2xl bg-white/85 backdrop-blur-md ring-1 ring-line px-2.5 py-1.5 text-right font-mono text-[10px] leading-[1.35] uppercase tracking-[0.18em] text-ink-soft">
          {placeName}
        </div>
      )}
      {fullscreenable && !error && (
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={expanded ? "Close fullscreen map" : "Expand map"}
          className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-white/90 backdrop-blur-md ring-1 ring-line text-ink shadow-sm transition-colors hover:bg-white"
        >
          {expanded ? <IconClose className="size-4" /> : <IconExpand className="size-4" />}
        </button>
      )}
      {debug && <MapDebugPanel busLayer={busLayerRef} />}
    </div>
  );
}

/** Rider's own location dot + heading cone, updated imperatively. */
function useUserHereOverlay(
  api: typeof google | null | undefined,
  mapRef: React.RefObject<google.maps.Map | null>,
  userLocation: Props["userLocation"],
) {
  const overlayRef = useRef<UserHereOverlay | null>(null);

  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;
    if (!userLocation) {
      overlayRef.current?.destroy();
      overlayRef.current = null;
      return;
    }
    if (!overlayRef.current) overlayRef.current = new UserHereOverlay(api, m, userLocation);
    else overlayRef.current.update(userLocation);
    // The overlay is imperatively updated from the ref; re-running on every
    // userLocation identity change would rebuild the marker each GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    api,
    userLocation?.lat,
    userLocation?.lng,
    userLocation?.headingDeg,
    userLocation?.accuracyM,
  ]);

  useEffect(
    () => () => {
      overlayRef.current?.destroy();
      overlayRef.current = null;
    },
    [],
  );
}
