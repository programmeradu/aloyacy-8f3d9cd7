// React Query hook for the live GTFS-RT feed.
//
// Exposes `isStale` + `staleSec` derived from both the upstream `stale` flag
// (proxy down / feed unreachable) and the elapsed time since the last
// successful in-browser refetch. The companion UI uses this to render an
// honest "live feed lost" banner instead of silently freezing the map.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { RealtimeSnapshot } from "./gtfs-rt.server";

const STALE_THRESHOLD_SEC = 60;

async function fetchRealtime(): Promise<RealtimeSnapshot> {
  const res = await fetch("/api/public/realtime");
  if (!res.ok) throw new Error("realtime fetch failed");
  return res.json();
}

export function useRealtime() {
  const q = useQuery({
    queryKey: ["gtfs-rt"],
    queryFn: fetchRealtime,
    refetchInterval: 20_000,
    staleTime: 15_000,
  });

  const now = Math.floor(Date.now() / 1000);
  const fetchedAt = q.data?.fetchedAt ?? 0;
  const staleSec = fetchedAt > 0 ? Math.max(0, now - fetchedAt) : Infinity;
  const isStale = !!q.data?.stale || staleSec > STALE_THRESHOLD_SEC;

  // Trips with an active arrival but no fresh vehicle position. Any
  // consumer can ask "is this a ghost?" without re-deriving the logic.
  const ghostTripIds = useMemo(
    () => new Set(q.data?.ghostTripIds ?? []),
    [q.data?.ghostTripIds],
  );

  // tripId → seconds since the most recent rider sighting. Consumers
  // pass the matching age into smartEtaV2 / classifyFreshness so the
  // displayed tier is "rider-confirmed" instead of "ghost"/"predicted".
  const riderConfirmedAge = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of q.data?.riderConfirmedTrips ?? []) {
      m.set(r.tripId, r.ageSec);
    }
    return m;
  }, [q.data?.riderConfirmedTrips]);

  return { ...q, isStale, staleSec, ghostTripIds, riderConfirmedAge };
}


/** Hook returning a function that forces a fresh realtime fetch.
 *  Used on visibilitychange "visible" after the rider returned to the app. */
export function useInvalidateRealtime() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["gtfs-rt"] });
}

/** Auto-invalidate the realtime cache + any custom callback when the tab
 *  returns to the foreground after being hidden for > `minHiddenSec`. */
export function useResumeRefresh(
  onResume: () => void,
  minHiddenSec = 30,
) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible") {
        const elapsed = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0;
        hiddenAt = null;
        if (elapsed >= minHiddenSec) onResume();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [onResume, minHiddenSec]);
}
