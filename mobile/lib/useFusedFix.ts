// Continuous GPS fusion for the rider, mirroring web `useFusedFix`.
//
// Inputs:
//   - expo-location `watchPositionAsync` at high accuracy (1s / 5m delta)
//   - optional polyline (active leg) for snap-to-route
//
// Outputs the same `FusedFix` shape the web app uses (Kalman-smoothed
// position, smoothed speed/bearing, dead-reckoned ticks at 2 Hz so the
// HUD stays alive when the OS pauses location updates — tunnels, locked
// screen, shelter blind-spots).

import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { GeoFuser, type FusedFix } from "@aloya/core/geo-fusion";
import type { LatLng } from "@aloya/core/shapes";

export type { FusedFix } from "@aloya/core/geo-fusion";

export type UseFusedFixResult = {
  fix: FusedFix | null;
  error: string | null;
  permission: Location.PermissionStatus | "unknown";
};

export function useFusedFix(opts: {
  enabled: boolean;
  /** Optional polyline (walking step or trip shape) for snap-to-route. */
  activePath?: LatLng[] | null;
}): UseFusedFixResult {
  const [fix, setFix] = useState<FusedFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<
    Location.PermissionStatus | "unknown"
  >("unknown");

  const fuserRef = useRef<GeoFuser | null>(null);
  const pathRef = useRef<LatLng[] | null | undefined>(opts.activePath);
  pathRef.current = opts.activePath;

  useEffect(() => {
    if (!opts.enabled) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    let tickHandle: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setPermission(status);
        if (status !== "granted") {
          setError("Location permission denied");
          return;
        }
        fuserRef.current = new GeoFuser();

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (pos) => {
            if (cancelled) return;
            setError(null);
            const next = fuserRef.current!.ingest(
              {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracyM: pos.coords.accuracy ?? 25,
                speedMps: pos.coords.speed ?? null,
                headingDeg: pos.coords.heading ?? null,
                timestamp: pos.timestamp,
              },
              pathRef.current,
            );
            setFix(next);
          },
        );

        // Dead-reckon at 2 Hz so the HUD never freezes between samples.
        tickHandle = setInterval(() => {
          const fr = fuserRef.current;
          if (!fr) return;
          const next = fr.extrapolate(Date.now(), pathRef.current);
          if (next && !cancelled) setFix(next);
        }, 500);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      if (tickHandle) clearInterval(tickHandle);
      fuserRef.current = null;
    };
  }, [opts.enabled]);

  return { fix, error, permission };
}
