import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  finalWalkLeg,
  firstWalkMeters,
  isBeyondWalking,
  parseKapnosLocalUnix,
  type PlanClock,
} from "@aloya/core/plan-intent";

import { fetchPlan, type Itinerary } from "@/lib/plan";
import type { PickedPlace } from "@/components/PlacesAutocomplete";
import { fetchBikeShare, fetchBoltScooter, fetchLastMileChain } from "@/lib/wave3";
import { fetchParkAndRide } from "@/lib/pnr";
import { fetchKapnos } from "@/lib/kapnos";
import { fetchDustAdvisory } from "@/lib/dust";
import { fetchItineraryTrafficAlerts, itinerarySamplePoints } from "@/lib/traffic-alerts";

type Awaited_<T> = T extends Promise<infer U> ? U : T;

export type PlanAlternates = {
  pnr: Awaited_<ReturnType<typeof fetchParkAndRide>> | null;
  kapnos: Awaited_<ReturnType<typeof fetchKapnos>> | null;
  dust: Awaited_<ReturnType<typeof fetchDustAdvisory>> | null;
  bike: Awaited_<ReturnType<typeof fetchBikeShare>> | null;
  bolt: Awaited_<ReturnType<typeof fetchBoltScooter>> | null;
  chain: Awaited_<ReturnType<typeof fetchLastMileChain>> | null;
  trafficReport: Awaited_<ReturnType<typeof fetchItineraryTrafficAlerts>> | null;
  kapnosMiles: {
    firstMile: Itinerary | null;
    lastMile: Itinerary | null;
    firstMileLoading: boolean;
    lastMileLoading: boolean;
  };
};

/**
 * Every non-primary query the plan screen fans out once a top itinerary
 * exists: Park & Ride, Kapnos coach (plus bus legs to/from the coach stop when
 * it is beyond walking), dust advisory, alt modes, and live traffic.
 */
export function usePlanQueries(args: {
  origin: PickedPlace;
  destination: PickedPlace | null;
  topItinerary: Itinerary | null;
  hasPlan: boolean;
  clock: PlanClock;
}): PlanAlternates {
  const { origin, destination, topItinerary, hasPlan, clock } = args;
  const canPlan = !!destination;
  const busOnlySec = topItinerary?.totalDurationSec ?? null;
  const firstWalkM = useMemo(() => firstWalkMeters(topItinerary?.legs), [topItinerary]);
  const finalWalk = useMemo(() => finalWalkLeg(topItinerary?.legs), [topItinerary]);

  const alts = useQueries({
    queries: [
      {
        queryKey: ["pnr", origin, destination, busOnlySec, firstWalkM],
        queryFn: () =>
          fetchParkAndRide({
            from: origin,
            to: destination!,
            busOnlyDurationSec: busOnlySec,
            busOnlyAccessWalkM: firstWalkM,
          }),
        enabled: canPlan && hasPlan,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["kapnos", origin, destination, clock.departAtUnix, clock.arriveByUnix],
        queryFn: () =>
          fetchKapnos({
            from: { lat: origin.lat, lng: origin.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            afterUnix: clock.departAtUnix,
            beforeUnix: clock.arriveByUnix,
          }),
        enabled: canPlan,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["dust", origin.lat, origin.lng],
        queryFn: () => fetchDustAdvisory({ lat: origin.lat, lng: origin.lng }),
        enabled: canPlan,
        staleTime: 10 * 60_000,
      },
      {
        queryKey: ["bike", origin, destination, busOnlySec],
        queryFn: () =>
          fetchBikeShare({
            from: { lat: origin.lat, lng: origin.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            busOnlyDurationSec: busOnlySec,
          }),
        enabled: canPlan && hasPlan,
        staleTime: 60_000,
      },
      {
        queryKey: ["bolt", origin, destination, busOnlySec],
        queryFn: () =>
          fetchBoltScooter({
            from: { lat: origin.lat, lng: origin.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            busOnlyDurationSec: busOnlySec,
          }),
        enabled: canPlan && hasPlan,
        staleTime: 5 * 60_000,
      },
      {
        queryKey: [
          "chain",
          finalWalk?.alight.lat ?? null,
          finalWalk?.alight.lng ?? null,
          destination,
          topItinerary?.arrivalUnix ?? null,
        ],
        queryFn: () =>
          fetchLastMileChain({
            alight: finalWalk
              ? finalWalk.alight
              : { lat: destination!.lat, lng: destination!.lng, name: destination!.label },
            destination: { lat: destination!.lat, lng: destination!.lng, name: destination!.label },
            arrivalUnix: topItinerary?.arrivalUnix ?? null,
            finalWalkMeters: finalWalk?.meters ?? null,
          }),
        enabled: canPlan && hasPlan && !!finalWalk,
        staleTime: 5 * 60_000,
      },
    ],
  });

  const kapnos = alts[1].data ?? null;
  const pickupFar = isBeyondWalking(kapnos?.pickup.distanceM);
  const dropoffFar = isBeyondWalking(kapnos?.dropoff.distanceM);
  const next = kapnos?.departures[0];
  const coachDepartUnix = parseKapnosLocalUnix(next?.departLocal);
  const coachArriveUnix = parseKapnosLocalUnix(next?.arriveLocal);

  // When the coach stop is not walkable, plan a real bus leg to it rather than
  // telling the rider to walk 20 km.
  const firstMileQuery = useQuery({
    queryKey: [
      "kapnos.firstMile",
      origin.lat,
      origin.lng,
      kapnos?.pickup.lat ?? null,
      kapnos?.pickup.lng ?? null,
      coachDepartUnix ?? null,
    ],
    queryFn: async () => {
      if (!kapnos) return null;
      try {
        const res = await fetchPlan({
          from: origin,
          to: { lat: kapnos.pickup.lat, lng: kapnos.pickup.lng, label: kapnos.pickup.name },
          arriveByUnix: coachDepartUnix,
        });
        return res.itineraries[0] ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!kapnos && pickupFar,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const lastMileQuery = useQuery({
    queryKey: [
      "kapnos.lastMile",
      kapnos?.dropoff.lat ?? null,
      kapnos?.dropoff.lng ?? null,
      destination?.lat ?? null,
      destination?.lng ?? null,
      coachArriveUnix ?? null,
    ],
    queryFn: async () => {
      if (!kapnos || !destination) return null;
      try {
        const res = await fetchPlan({
          from: { lat: kapnos.dropoff.lat, lng: kapnos.dropoff.lng, label: kapnos.dropoff.name },
          to: destination,
          departAtUnix: coachArriveUnix,
        });
        return res.itineraries[0] ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!kapnos && !!destination && dropoffFar,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const trafficPoints = useMemo(
    () => (topItinerary ? itinerarySamplePoints(topItinerary) : []),
    [topItinerary],
  );
  const trafficQuery = useQuery({
    queryKey: ["itinerary-traffic", trafficPoints],
    queryFn: () => fetchItineraryTrafficAlerts(trafficPoints),
    enabled: trafficPoints.length > 0,
    staleTime: 90_000,
    refetchInterval: 120_000,
  });

  const firstMile = firstMileQuery.data ?? null;
  const lastMile = lastMileQuery.data ?? null;

  return {
    pnr: alts[0].data ?? null,
    kapnos,
    dust: alts[2].data ?? null,
    bike: alts[3].data ?? null,
    bolt: alts[4].data ?? null,
    chain: alts[5].data ?? null,
    trafficReport: trafficQuery.data ?? null,
    kapnosMiles: {
      firstMile,
      lastMile,
      firstMileLoading: pickupFar && firstMileQuery.isFetching && !firstMile,
      lastMileLoading: dropoffFar && lastMileQuery.isFetching && !lastMile,
    },
  };
}
