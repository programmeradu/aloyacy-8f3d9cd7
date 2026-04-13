import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { fetchRealtime, fetchStopsBundle } from "./api";
import { setStops } from "./gtfs";

export function useRealtime() {
  return useQuery({
    queryKey: ["realtime"],
    queryFn: fetchRealtime,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useStopsBundle() {
  const query = useQuery({
    queryKey: ["stops-bundle"],
    queryFn: fetchStopsBundle,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
  // Mirror stops into the module-level registry so synchronous lookups
  // (eta-v2, DepartureRow, MapView) work without prop-drilling.
  useEffect(() => {
    if (query.data?.stops) setStops(query.data.stops);
  }, [query.data]);
  return query;
}

export type Fix = { lat: number; lng: number; accuracyM: number } | null;

/**
 * Foreground geolocation. Asks for permission lazily on first mount.
 * Returns `null` until granted/resolved; UI should fall back to a
 * city-default (e.g. Limassol centre) so the Today screen never blocks.
 */
export function useGeoFix(): { fix: Fix; status: "idle" | "denied" | "ready" } {
  const [fix, setFix] = useState<Fix>(null);
  const [status, setStatus] = useState<"idle" | "denied" | "ready">("idle");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (!mounted) return;
      if (perm !== "granted") {
        setStatus("denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!mounted) return;
      setFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? 50,
      });
      setStatus("ready");
    })().catch(() => mounted && setStatus("denied"));
    return () => {
      mounted = false;
    };
  }, []);

  return { fix, status };
}
