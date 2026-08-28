// Builds the Today screen's nearby stop cards. Pure derivation on top of the
// shared `@aloya/core/home-board` primitives plus the mobile smart-ETA model;
// no hooks here, so it can be called from a memo and unit-reasoned about.

import {
  groupArrivalsByStop,
  nearestStops,
  routeChipsForStop,
  type BoardArrival,
} from "@aloya/core/home-board";
import { smartEtaV2 } from "./eta-v2";
import { formatDistance } from "./format";
import { getHeadsignSync } from "./headsigns";
import type { RealtimeArrival, RealtimeVehicle, Stop } from "./api";
import type { StopCardData, StopCardRoute } from "@/components/StopCard";

export type RouteMetaMap = Record<string, { short: string; long: string; color?: string } | undefined>;

export function nearbyStops(here: { lat: number; lng: number }, stops: Stop[] | undefined, limit = 6) {
  if (!stops?.length) return [] as (Stop & { d: number })[];
  return nearestStops(here, stops, limit);
}

export function buildStopCards(input: {
  nearby: (Stop & { d: number })[];
  arrivals: RealtimeArrival[];
  vehicles: RealtimeVehicle[];
  routes: RouteMetaMap;
  riderConfirmedAge: Map<string, number>;
  riderConfirmedCount?: Map<string, number>;
  nowSec?: number;
}): StopCardData[] {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const byStop = groupArrivalsByStop(input.arrivals as unknown as BoardArrival[], nowSec);

  return input.nearby.map((s, idx) => {
    const arr = byStop.get(s.id) ?? [];
    const smart = smartEtaV2({
      stopId: s.id,
      arrivals: input.arrivals,
      vehicles: input.vehicles,
      nowSec,
      agency: s.agency,
      riderConfirmedAgeSec: arr[0] ? input.riderConfirmedAge.get(arr[0].tripId) : undefined,
      riderConfirmedSources: arr[0] ? input.riderConfirmedCount?.get(arr[0].tripId) : undefined,
    });

    const routes = routeChipsForStop(arr, input.routes, (tripId, routeId) =>
      getHeadsignSync(tripId, routeId),
    ) as StopCardRoute[];

    return {
      id: s.id,
      code: s.code || s.id,
      name: s.name,
      towards: s.agency === "IC" ? "Intercity" : formatDistance(s.d),
      etaMin: smart?.etaMin ?? arr[0]?.etaMin ?? null,
      etaTier: smart?.tier,
      etaConfidenceLevel: smart?.confidence,
      etaBlurb: smart?.blurb,
      etaSingleSource: smart?.singleSource,
      routes,
      highlight: idx === 0,
    } satisfies StopCardData;
  });
}
