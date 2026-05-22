// Continuous high-accuracy geolocation watch. Activated on demand so the
// passive `useGeolocation` snapshot stays cheap.

import { useEffect, useRef, useState } from "react";

export type LiveFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  timestamp: number;
};

export function useGeoWatch(enabled: boolean): {
  fix: LiveFix | null;
  error: string | null;
} {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setError("Geolocation unsupported");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? 50,
          speedMps: pos.coords.speed,
          headingDeg: pos.coords.heading,
          timestamp: pos.timestamp,
        });
      },
      (err) => setError(err.message),
      {
        enableHighAccuracy: true,
        maximumAge: 2_000,
        timeout: 15_000,
      },
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled]);

  return { fix, error };
}
