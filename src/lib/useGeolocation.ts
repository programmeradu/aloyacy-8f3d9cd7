// User geolocation with localStorage cache + Nicosia fallback.
import { useEffect, useState } from "react";
import { NICOSIA_CENTER } from "./gtfs";

export type Coords = { lat: number; lng: number };

export type GeoState = {
  coords: Coords;
  source: "live" | "cached" | "fallback";
  loading: boolean;
  error: string | null;
};

const KEY = "aloya:geo";
const MAX_AGE_MS = 1000 * 60 * 30; // 30 min

function readCache(): Coords | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number; ts: number };
    if (Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function writeCache(c: Coords) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, ts: Date.now() }));
  } catch {
    /* noop */
  }
}

export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>(() => {
    if (typeof window === "undefined") {
      return {
        coords: NICOSIA_CENTER,
        source: "fallback",
        loading: false,
        error: null,
      };
    }
    const cached = readCache();
    return {
      coords: cached ?? NICOSIA_CENTER,
      source: cached ? "cached" : "fallback",
      loading: true,
      error: null,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setState((s) => ({ ...s, loading: false, error: "unsupported" }));
      return;
    }
    const id = navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeCache(c);
        setState({ coords: c, source: "live", loading: false, error: null });
      },
      (err) => {
        setState((s) => ({ ...s, loading: false, error: err.message }));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
    return () => {
      // getCurrentPosition has no real cancel — id is undefined
      void id;
    };
  }, []);

  return state;
}
