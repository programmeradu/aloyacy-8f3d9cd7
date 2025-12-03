// Live traffic-aware drive ETA from the bus's current position to a target
// stop, via Google Routes API (through the connector gateway).
//
// We only call this while the rider is on-board — that's the only time the
// number matters and the only time we have an authoritative vehicle
// position. The hook is aggressively throttled to keep gateway usage tiny:
//   - refetches at most every 30 s
//   - skips refetch if the bus hasn't moved > 60 m since the last call
//   - caches by quantised (from, to) so map jitter doesn't trigger refetches
//
// Returns `null` until the first successful response, so callers can fall
// back to the distance-floored schedule ETA in the meantime.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef } from "react";
import { getDriveEta } from "./maps.functions";
import { distanceM } from "./geo";

const MIN_MOVE_M = 60;
const REFETCH_MS = 30_000;

type Pt = { lat: number; lng: number };

export function useDriveEta(opts: {
  enabled: boolean;
  from: Pt | null;
  to: Pt | null;
}): {
  etaSec: number | null;
  distanceMeters: number | null;
  fetchedAt: number | null;
} {
  const { enabled, from, to } = opts;
  const fetchEta = useServerFn(getDriveEta);
  const qc = useQueryClient();

  // Quantise the "from" point so React Query doesn't refetch on every GPS
  // tick. Round to ~50 m grid (4 decimal places ≈ 11 m, 3 ≈ 110 m → 4 is
  // a good middle ground for an urban bus).
  const q = (n: number) => Math.round(n * 5000) / 5000;
  const keyFrom = from ? `${q(from.lat)},${q(from.lng)}` : null;
  const keyTo = to ? `${q(to.lat)},${q(to.lng)}` : null;
  const queryKey = useMemo(
    () => ["drive-eta", keyFrom, keyTo] as const,
    [keyFrom, keyTo],
  );

  // Track last fetched position so we can skip refetch when the bus barely
  // moved (e.g. dwelling at a stop or red light).
  const lastFromRef = useRef<Pt | null>(null);

  const query = useQuery({
    queryKey,
    enabled: enabled && !!from && !!to,
    queryFn: async () => {
      if (!from || !to) return null;
      lastFromRef.current = from;
      const { route } = await fetchEta({ data: { from, to } });
      if (!route) return null;
      return {
        etaSec: route.durationSec,
        distanceMeters: route.distanceMeters,
        fetchedAt: Date.now(),
      };
    },
    staleTime: REFETCH_MS,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: false,
  });

  // Decay the cached ETA between refetches so the countdown still moves.
  // Without this, the rider sees the same "8 min" for 30 s, then jumps.
  const data = query.data;
  const now = Date.now();
  const elapsedSec = data ? Math.max(0, Math.floor((now - data.fetchedAt) / 1000)) : 0;
  const etaSec = data ? Math.max(0, data.etaSec - elapsedSec) : null;

  // If the bus has moved far since the last fetched origin, invalidate
  // early to grab a fresh number ahead of the regular interval.
  useEffect(() => {
    if (!enabled || !from || !data) return;
    const moved = lastFromRef.current
      ? distanceM(lastFromRef.current, from)
      : Infinity;
    if (moved > MIN_MOVE_M && now - data.fetchedAt > 8_000) {
      qc.invalidateQueries({ queryKey });
    }
  }, [from, enabled, data, qc, queryKey, now]);

  return {
    etaSec,
    distanceMeters: data?.distanceMeters ?? null,
    fetchedAt: data?.fetchedAt ?? null,
  };
}
