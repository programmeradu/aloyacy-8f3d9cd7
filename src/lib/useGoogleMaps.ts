// Loader hook for Google Maps JS API. Singleton-safe, uses async loading + callback.
import { useEffect, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
    __aloyaGmapsInit?: () => void;
    __aloyaGmapsPromise?: Promise<typeof google>;
  }
}

const KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
  | string
  | undefined;
const CHANNEL = import.meta.env
  .VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

function load(): Promise<typeof google> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__aloyaGmapsPromise) return window.__aloyaGmapsPromise;
  if (!KEY) return Promise.reject(new Error("missing maps key"));

  window.__aloyaGmapsPromise = new Promise((resolve, reject) => {
    window.__aloyaGmapsInit = () => resolve(window.google!);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&loading=async&callback=__aloyaGmapsInit&libraries=geometry&channel=${CHANNEL ?? ""}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("maps script failed"));
    document.head.appendChild(s);
  });
  return window.__aloyaGmapsPromise;
}

export function useGoogleMaps() {
  const [api, setApi] = useState<typeof google | null>(
    typeof window !== "undefined" && window.google?.maps ? window.google : null,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (api) return;
    let cancelled = false;
    load()
      .then((g) => !cancelled && setApi(g))
      .catch((e) => !cancelled && setError(e.message ?? String(e)));
    return () => {
      cancelled = true;
    };
  }, [api]);
  return { api, error };
}

// Aloya editorial light map style — limestone background, muted aqua water,
// minimal POIs, soft olive park fills. Tuned to match src/styles.css palette.
export const ALOYA_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f3ede1" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a5246" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f3ede1" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dde6cf" }] },
  { featureType: "poi.park", elementType: "labels.text", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f7f1e3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ecd9a8" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d9b97a" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bcd9d8" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4d7a78" }] },
];
