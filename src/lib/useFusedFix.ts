// React hook over GeoFuser. Subscribes to navigator.geolocation
// (high accuracy) and produces a smoothed fix at ~2 Hz, including
// during the dead-reckoning window after the sensor pauses.

import { useEffect, useRef, useState } from "react";
import { GeoFuser, type FusedFix } from "./geo-fusion";
import type { LatLng } from "./shapes";

export function useFusedFix(opts: {
  enabled: boolean;
  /** Optional polyline for the active leg used to snap-to-route. */
  activePath?: LatLng[] | null;
}): { fix: FusedFix | null; error: string | null } {
  const [fix, setFix] = useState<FusedFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fuserRef = useRef<GeoFuser | null>(null);
  const pathRef = useRef<LatLng[] | null | undefined>(opts.activePath);
  pathRef.current = opts.activePath;

  useEffect(() => {
    if (!opts.enabled) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setError("Geolocation unsupported");
      return;
    }
    fuserRef.current = new GeoFuser();

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        const next = fuserRef.current!.ingest(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? 25,
            speedMps: pos.coords.speed,
            headingDeg: pos.coords.heading,
            timestamp: pos.timestamp,
          },
          pathRef.current,
        );
        setFix(next);
      },
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 15_000 },
    );

    // Dead-reckon ticker at 2 Hz so the HUD stays alive when the
    // sensor goes quiet (tunnels, locked screen).
    const tick = window.setInterval(() => {
      const fr = fuserRef.current;
      if (!fr) return;
      const next = fr.extrapolate(Date.now(), pathRef.current);
      if (next) setFix(next);
    }, 500);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(tick);
      fuserRef.current = null;
    };
  }, [opts.enabled]);

  return { fix, error };
}
