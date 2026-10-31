import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import type mapboxgl from "mapbox-gl";
import { useMapbox, applyAloyaTint, type MapboxApi } from "@/lib/useMapbox";
import { basemapStyle, isAerial } from "@/lib/basemap";
import { MapAttribution } from "@/components/map/MapAttribution";
import { useDomPins, type DomPin } from "@/components/map/useDomPins";
import { GOOGLE_TO_MAPBOX_ZOOM } from "@/components/map/mapSymbols";
import { IconExpand, IconClose } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { spanToZoom } from "@aloya/core/path-geometry";
import {
  overrideSignature,
  selectMapVehicles,
  type VehicleOverride,
} from "@aloya/core/map-vehicles";
import { MapDebugPanel } from "@/components/map/MapDebugPanel";
import { useLiveBusLayer } from "@/components/map/useLiveBusLayer";
import { useMapFullscreen } from "@/components/map/useMapFullscreen";
import { useStaticLayer } from "@/components/map/useStaticLayer";
import { useTripPaths } from "@/components/map/useTripPaths";
import { UserHereOverlay } from "@/components/map/UserHereOverlay";
import type { MapMarker, MapSegment } from "@/components/map/types";

export type { MapMarker, MapSegment };

type Props = {
  height?: string;
  center?: { lat: number; lng: number };
  /** Approximate viewport span in km. Used as fallback zoom when no bounds. */
  spanKm?: number;
  /** Encoded polyline (precision 5 polyline algorithm). */
  polyline?: string;
  /** Per-leg lines (rides in their line colour, walks dotted). */
  segments?: MapSegment[];
  /** Padding used when fitting the view to the content. */
  fitPadding?: number | { top: number; bottom: number; left: number; right: number };
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
  /** Roam: fill the parent edge to edge with no chrome (badges, expand button). */
  bare?: boolean;
  /** Roam: React-rendered DOM pins. */
  pins?: DomPin[];
  /** Hide overlapping pins closer than this many px (0 = off). */
  declutterPx?: number;
  /** Roam: distance in px from the map bottom for the attribution and logo. */
  attribBottom?: number;
  /** Roam: put attribution and logo at this distance from the top instead. */
  attribTop?: number | string;
  /** Show the imagery credit button on the map (off when the page renders it). */
  attribution?: boolean;
  /** Corner for the Mapbox logo; defaults to the attribution side. */
  logoCorner?: "top-left" | "bottom-left";
};

export function MapPreview({
  height = "h-64",
  center = NICOSIA_CENTER,
  spanKm = 8,
  polyline,
  segments,
  fitPadding,
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
  bare = false,
  pins,
  declutterPx = 0,
  attribBottom = 8,
  attribTop,
  attribution = true,
  logoCorner,
}: Props) {
  // placeName is derived from browser geolocation on the client, so the SSR
  // markup ("Cyprus") never matches. Render the badge only after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const { api, error: loadError, retry: retryLoad } = useMapbox();
  // WebGL can be missing (old devices, blocked GPU) or briefly unavailable
  // (iOS Safari frees the previous screen's map context a moment late). Map
  // construction then throws: try again shortly, then show a retry fallback.
  const [glError, setGlError] = useState(false);
  const [glTry, setGlTry] = useState(0);
  const error = loadError || glError;
  const { data: rt } = useRealtime();
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(0);

  const focused = !!(focusTripId || focusRouteId);
  const restricted = !focused && !!(restrictTripIds && restrictTripIds.length);

  // Initialize map once the Mapbox library is loaded.
  useEffect(() => {
    if (!api || !hostRef.current || mapRef.current) return;
    let m: mapboxgl.Map;
    try {
      m = new api.Map({
        container: hostRef.current,
        style: basemapStyle() as never,
        center: [center.lng, center.lat],
        zoom: spanToZoom(spanKm) + GOOGLE_TO_MAPBOX_ZOOM,
        attributionControl: false,
        pitchWithRotate: false,
        dragRotate: false,
        cooperativeGestures: false,
        logoPosition: logoCorner ?? (attribTop != null ? "top-left" : "bottom-left"),
      });
    } catch (e) {
      console.warn("[map] init failed", e);
      if (glTry < 2) {
        const id = window.setTimeout(() => setGlTry((n) => n + 1), 700 * (glTry + 1));
        return () => window.clearTimeout(id);
      }
      setGlError(true);
      return;
    }
    setGlError(false);
    if (!isAerial()) m.addControl(new api.AttributionControl({ compact: true }), "top-left");
    m.touchZoomRotate.disableRotation();
    if (!isAerial()) m.on("style.load", () => applyAloyaTint(m));
    m.on("load", () => setMapReady((n) => n + 1));
    // A lost WebGL context (iOS under memory pressure) leaves a blank map:
    // rebuild it once the browser restores the context.
    const canvas = m.getCanvas();
    const onRestored = () => setGlTry((n) => n + 1);
    canvas.addEventListener("webglcontextrestored", onRestored);
    mapRef.current = m;
    return () => {
      canvas.removeEventListener("webglcontextrestored", onRestored);
      m.remove();
      mapRef.current = null;
    };
  }, [api, glTry]); // eslint-disable-line react-hooks/exhaustive-deps

  const { expanded, fallbackOverlay, wrapperRef, toggleFullscreen } = useMapFullscreen(api, mapRef);

  // Update center / zoom when there is no content to fit to.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const hasContent =
      (polyline && polyline.length > 0) ||
      (segments && segments.length > 0) ||
      (markers && markers.length > 0);
    if (fitToContent ?? hasContent) return;
    m.jumpTo({
      center: [center.lng, center.lat],
      zoom: spanToZoom(spanKm) + GOOGLE_TO_MAPBOX_ZOOM,
    });
    // center.lat/lng are depended on individually so a new object identity from
    // the parent does not re-pan the map on every render.
  }, [center.lat, center.lng, spanKm, polyline, segments, markers, fitToContent, mapReady]);

  const layerRef = useStaticLayer({
    api: mapReady ? api : null,
    mapRef,
    polyline,
    segments,
    fitPadding,
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
    api: mapReady ? api : null,
    mapRef,
    markersRef: layerRef,
    vehicles: liveVehicles ? vehicles : undefined,
    tripPaths,
    focused,
    restricted,
  });

  useUserHereOverlay(mapReady ? api : null, mapRef, userLocation);
  const pinPortals = useDomPins(mapReady ? api : null, mapRef, pins, declutterPx);

  const liveCount = focused || restricted ? vehicles.length : (rt?.vehicles.length ?? 0);

  // When fullscreen the wrapper already fills the viewport, so the rounded
  // corners + ring would look odd — drop them while expanded.
  const wrapperClass = expanded
    ? fallbackOverlay
      ? "fixed inset-0 z-[2147483000] w-screen h-screen overflow-hidden bg-limestone-soft"
      : "relative w-full h-full overflow-hidden bg-limestone-soft"
    : bare
      ? "absolute inset-0 overflow-hidden bg-[#3b3d38]"
      : `relative w-full overflow-hidden rounded-[28px] bg-[#3b3d38] ${height}`;

  return (
    <div
      ref={wrapperRef}
      className={`${wrapperClass} r-mapwrap`}
      style={{
        ["--r-map-ctrl-bottom" as string]: `${attribBottom}px`,
        ["--r-map-ctrl-top" as string]:
          typeof attribTop === "string" ? attribTop : `${attribTop ?? 8}px`,
      }}
    >
      {/* Inline position: mapbox-gl adds .mapboxgl-map { position: relative }. */}
      <div ref={hostRef} className="absolute inset-0" style={{ position: "absolute", inset: 0 }} />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[15px] font-medium text-white/85">{t("map.unavailable")}</p>
          <button
            type="button"
            className="r-pill r-pill--k"
            onClick={() => {
              setGlError(false);
              if (loadError) retryLoad();
              else setGlTry((n) => (n >= 2 ? 0 : n + 1));
            }}
          >
            {t("map.retry")}
          </button>
        </div>
      )}
      {pinPortals}
      {attribution && isAerial() && !error ? (
        <MapAttribution bottom={attribBottom} top={attribTop} />
      ) : null}
      {liveVehicles && !hideLiveBadge && !bare && (
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
      {hydrated && placeName && !bare && (
        <div className="pointer-events-none absolute bottom-3 right-3 max-w-[65%] rounded-2xl bg-white/85 backdrop-blur-md ring-1 ring-line px-2.5 py-1.5 text-right font-mono text-[10px] leading-[1.35] uppercase tracking-[0.18em] text-ink-soft">
          {placeName}
        </div>
      )}
      {fullscreenable && !error && !bare && (
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
  api: MapboxApi | null | undefined,
  mapRef: React.RefObject<mapboxgl.Map | null>,
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
