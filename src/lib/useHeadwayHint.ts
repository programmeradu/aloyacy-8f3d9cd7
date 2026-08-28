// B2 chance for the HUD keep-wait sentence. Same survival number as the stop card.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { headwayHintForRoute, type HeadwayHint } from "@aloya/core/headway-chance";
import { getStopRunHints } from "@/lib/headway.functions";
import { useRealtime } from "@/lib/useRealtime";

export function useHeadwayHint(input: {
  routeId?: string | null;
  stopId?: string | null;
  arrivalUnix?: number | null;
}): HeadwayHint | null {
  const { data: rt } = useRealtime();
  const runHintsFn = useServerFn(getStopRunHints);
  const routeId = input.routeId?.trim() ?? "";
  const stopId = input.stopId?.trim() ?? "";
  const arrivalUnix = input.arrivalUnix ?? 0;
  const enabled = !!routeId && !!stopId && Number.isFinite(arrivalUnix) && arrivalUnix > 0;
  const { data: runHints } = useQuery({
    queryKey: ["stopRunHints", stopId, routeId],
    queryFn: () => runHintsFn({ data: { routeIds: [routeId], stopId } }),
    enabled,
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    if (!rt || !runHints || !enabled) return null;
    return headwayHintForRoute({
      obs: runHints.headways,
      vehicles: rt.vehicles,
      arrivals: rt.arrivals,
      routeId,
      stopId,
      arrivalUnix,
      nowSec: Math.floor(Date.now() / 1000),
    });
  }, [rt, runHints, enabled, routeId, stopId, arrivalUnix]);
}
