/// <reference types="google.maps" />
// Single-flight loader for the Google Maps JS SDK on web.
//
// Kept out of the component because every mount would otherwise race to
// append its own <script>. The promise is parked on `window` so a fast
// remount (or a second map on the same screen) reuses the in-flight load.

// Browser-restricted Maps key. Supplied through mobile/.env (see
// mobile/.env.example) — never hardcoded, so a fork ships with no key of ours.
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
const CHANNEL = process.env.EXPO_PUBLIC_GOOGLE_MAPS_TRACKING_ID ?? "";

declare global {
  interface Window {
    google?: typeof google;
    __aloyaGmapsInit?: () => void;
    __aloyaGmapsPromise?: Promise<typeof google>;
  }
}

export function loadMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (!KEY) {
    return Promise.reject(
      new Error("Missing EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY — see mobile/.env.example"),
    );
  }
  if (window.__aloyaGmapsPromise) return window.__aloyaGmapsPromise;
  window.__aloyaGmapsPromise = new Promise((resolve, reject) => {
    window.__aloyaGmapsInit = async () => {
      try {
        // With `loading=async`, the bootstrap callback fires before the
        // core `maps` library is actually attached to `google.maps` — so
        // `new google.maps.Map(...)` throws "Map is not a constructor"
        // on the first mount. Explicitly import the libraries we use
        // before resolving so every consumer sees a fully-ready SDK.
        await Promise.all([
          window.google!.maps.importLibrary("maps"),
          window.google!.maps.importLibrary("marker"),
          window.google!.maps.importLibrary("geometry"),
        ]);
        resolve(window.google!);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&loading=async&callback=__aloyaGmapsInit&libraries=geometry,marker&channel=${CHANNEL}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("maps failed"));
    document.head.appendChild(s);
  });
  return window.__aloyaGmapsPromise;
}
