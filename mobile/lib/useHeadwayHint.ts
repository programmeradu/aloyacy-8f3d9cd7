// B2 chance for the HUD keep-wait sentence. Same survival number as the stop card.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { headwayHintForRoute, type HeadwayHint } from "@aloya/core/headway-chance";
import { useRealtime } from "@/lib/hooks";
import { fetchStopRunHints } from "@/lib/no-show";

export function useHeadwayHint(input: {
  routeId?: string | null;
  stopId?: string | null;
  arrivalUnix?: number | null;
}): HeadwayHint | null {
  const rt = useRealtime();
  const routeId = input.routeId?.trim() ?? "";
  const stopId = input.stopId?.trim() ?? "";
  const arrivalUnix = input.arrivalUnix ?? 0;
  const enabled = !!routeId && !!stopId && Number.isFinite(arrivalUnix) && arrivalUnix > 0;
  const { data: hints } = useQuery({
    queryKey: ["stop-run-hints", stopId, routeId],
    queryFn: () => fetchStopRunHints([routeId], stopId),
    enabled,
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    if (!rt.data || !hints || !enabled) return null;
    return headwayHintForRoute({
      obs: hints.headways,
      vehicles: rt.data.vehicles,
      arrivals: rt.data.arrivals,
      routeId,
      stopId,
      arrivalUnix,
      nowSec: Math.floor(Date.now() / 1000),
    });
  }, [rt.data, hints, enabled, routeId, stopId, arrivalUnix]);
}
