// Everything the trip screen asks for *around* the bus plan: park & ride,
// taxi handoff, road incidents, bike share, scooters, dust advisory and the
// Kapnos airport coach (with its own first/last-mile bus plans).
//
// Each one is independently gated, fails soft to null, and never blocks the
// itinerary list from rendering.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  EGRESS_TAXI_MIN_METERS,
  KAPNOS_WALKABLE_M,
  accessWalkMeters,
  egressWalk,
  itineraryTrafficPoints,
  trafficPointsKey,
} from "@aloya/core/plan-signals";
import type { Itinerary } from "@/lib/itinerary-types";
import type { Point, TimeIntent } from "@/lib/plan-types";
import { planMultiLeg } from "@/lib/multileg.functions";
import { cyprusLocalToUnix } from "@/lib/plan-bridge";
import { suggestParkAndRide } from "@/lib/park-and-ride.functions";
import { suggestLastMileChain } from "@/lib/last-mile-chain.functions";
import { suggestBikeShare } from "@/lib/bikeshare.functions";
import { suggestBoltScooter } from "@/lib/bolt-scooter.functions";
import { suggestKapnos } from "@/lib/kapnos.functions";
import { getDustAdvisory } from "@/lib/pulse-live.functions";
import { getItineraryTrafficAlerts } from "@/lib/traffic-alerts.functions";
import type { A11yPlanPrefs } from "./tripPlanQuery";

/** Same threshold as the last-mile Bolt card (long walk, 1.5 km). */
const FIRST_MILE_BOLT_METERS = 1_500;

/** The walk from the start to the first bus, with the stop it ends at. */
function accessWalkLeg(it: Itinerary | null): {
  walkMeters: number;
  to: { lat: number; lng: number; name: string };
} | null {
  if (!it) return null;
  const firstRide = it.legs.findIndex((l) => l.kind === "ride");
  if (firstRide <= 0) return null;
  let m = 0;
  for (let i = 0; i < firstRide; i++) {
    const l = it.legs[i];
    if (l.kind === "walk") m += l.distanceMeters;
  }
  if (m <= 0) return null;
  const ride = it.legs[firstRide];
  if (ride.kind !== "ride") return null;
  return {
    walkMeters: Math.round(m),
    to: { lat: ride.board.lat, lng: ride.board.lng, name: ride.board.name },
  };
}

/** Runs a suggestion call and swallows failures — extras must never nag. */
async function soft<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export type TripSideQueries = ReturnType<typeof useTripSideQueries>;

export function useTripSideQueries({
  origin,
  destination,
  topItinerary,
  timeIntent,
  a11y,
  a11yKey,
}: {
  origin: Point | null;
  destination: Point | null;
  topItinerary: Itinerary | null;
  timeIntent: TimeIntent | null;
  a11y: A11yPlanPrefs | undefined;
  a11yKey: string;
}) {
  const planFn = useServerFn(planMultiLeg);
  const pnrFn = useServerFn(suggestParkAndRide);
  const chainFn = useServerFn(suggestLastMileChain);
  const trafficFn = useServerFn(getItineraryTrafficAlerts);
  const bikeFn = useServerFn(suggestBikeShare);
  const boltFn = useServerFn(suggestBoltScooter);
  const dustFn = useServerFn(getDustAdvisory);
  const kapnosFn = useServerFn(suggestKapnos);

  const busOnlyDurationSec = topItinerary?.totalDurationSec ?? null;
  const busOnlyAccessWalkM = accessWalkMeters(topItinerary);
  const geoKey = [origin?.lat, origin?.lng, destination?.lat, destination?.lng] as const;
  const bothEnds = !!origin && !!destination;

  const pnrQuery = useQuery({
    queryKey: ["pnr", ...geoKey, busOnlyDurationSec, busOnlyAccessWalkM],
    queryFn: () =>
      soft(() =>
        pnrFn({
          data: {
            from: { lat: origin!.lat, lng: origin!.lng, label: origin!.label },
            to: { lat: destination!.lat, lng: destination!.lng, label: destination!.label },
            busOnlyDurationSec,
            busOnlyAccessWalkM,
          },
        }),
      ),
    enabled: bothEnds,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const finalWalk = egressWalk(topItinerary);
  const chainQuery = useQuery({
    queryKey: [
      "lastMileChain",
      destination?.lat,
      destination?.lng,
      finalWalk?.alight.lat,
      finalWalk?.alight.lng,
      finalWalk?.walkMeters,
      topItinerary?.arrivalUnix ?? null,
    ],
    queryFn: () =>
      // Cheap client gate; the server re-checks with the full rule set.
      finalWalk!.walkMeters < EGRESS_TAXI_MIN_METERS
        ? null
        : soft(() =>
            chainFn({
              data: {
                alight: finalWalk!.alight,
                destination: {
                  lat: destination!.lat,
                  lng: destination!.lng,
                  name: destination!.label,
                },
                arrivalUnix: topItinerary!.arrivalUnix,
                finalWalkMeters: finalWalk!.walkMeters,
              },
            }),
          ),
    enabled: !!destination && !!finalWalk && !!topItinerary,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // First mile: when the walk to the first bus is as long as the walk that
  // triggers the last-mile Bolt card (1.5 km), offer Bolt to that stop too,
  // rather than an hour on foot.
  const firstWalk = accessWalkLeg(topItinerary);
  const firstChainQuery = useQuery({
    queryKey: [
      "firstMileChain",
      origin?.lat,
      origin?.lng,
      firstWalk?.to.lat,
      firstWalk?.to.lng,
      firstWalk?.walkMeters,
      topItinerary?.departureUnix ?? null,
    ],
    queryFn: () =>
      soft(() =>
        chainFn({
          data: {
            alight: { lat: origin!.lat, lng: origin!.lng, name: origin!.label },
            destination: firstWalk!.to,
            arrivalUnix: topItinerary!.departureUnix,
            finalWalkMeters: firstWalk!.walkMeters,
          },
        }),
      ),
    enabled:
      !!origin && !!firstWalk && !!topItinerary && firstWalk.walkMeters >= FIRST_MILE_BOLT_METERS,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const trafficPoints = itineraryTrafficPoints(topItinerary);
  const trafficQuery = useQuery({
    queryKey: ["itinTraffic", trafficPointsKey(trafficPoints)],
    queryFn: () => soft(() => trafficFn({ data: { points: trafficPoints } })),
    enabled: trafficPoints.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const bikeQuery = useQuery({
    queryKey: ["bikeShare", ...geoKey, busOnlyDurationSec],
    queryFn: () =>
      soft(() =>
        bikeFn({
          data: {
            from: { lat: origin!.lat, lng: origin!.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            busOnlyDurationSec,
          },
        }),
      ),
    enabled: bothEnds,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const boltQuery = useQuery({
    queryKey: ["boltScooter", ...geoKey, busOnlyDurationSec],
    queryFn: () =>
      soft(() =>
        boltFn({
          data: {
            from: { lat: origin!.lat, lng: origin!.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            busOnlyDurationSec,
          },
        }),
      ),
    enabled: bothEnds,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const dustQuery = useQuery({
    queryKey: ["dust-advisory", origin?.lat, origin?.lng],
    queryFn: () => soft(() => dustFn({ data: { lat: origin!.lat, lng: origin!.lng } })),
    enabled: !!origin,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const afterUnix = timeIntent?.leaveByISO
    ? Math.floor(new Date(timeIntent.leaveByISO).getTime() / 1000)
    : undefined;
  const beforeUnix = timeIntent?.arriveByISO
    ? Math.floor(new Date(timeIntent.arriveByISO).getTime() / 1000)
    : undefined;

  const kapnosQuery = useQuery({
    queryKey: ["kapnos", ...geoKey, afterUnix ?? null, beforeUnix ?? null],
    queryFn: () =>
      soft(() =>
        kapnosFn({
          data: {
            from: { lat: origin!.lat, lng: origin!.lng },
            to: { lat: destination!.lat, lng: destination!.lng },
            afterUnix,
            beforeUnix,
          },
        }),
      ),
    enabled: bothEnds,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const kapnos = kapnosQuery.data ?? null;

  // Too far to walk to the coach? We plan the city bus for them rather than
  // shrugging with "take a bus or a taxi".
  const pickupFar = !!kapnos && kapnos.pickup.distanceM > KAPNOS_WALKABLE_M;
  const dropoffFar = !!kapnos && kapnos.dropoff.distanceM > KAPNOS_WALKABLE_M;

  // Tying the first mile to the coach's own departure is what makes a
  // "leave tomorrow 06:00" trip plan against tomorrow's coach.
  const nextCoach = kapnos?.departures[0];
  const coachDepartUnix = nextCoach ? cyprusLocalToUnix(nextCoach.departLocal) : undefined;
  const coachArriveUnix = nextCoach ? cyprusLocalToUnix(nextCoach.arriveLocal) : undefined;

  const firstMileQuery = useQuery({
    queryKey: [
      "kapnos.firstMile",
      origin?.lat,
      origin?.lng,
      kapnos?.pickup.lat,
      kapnos?.pickup.lng,
      coachDepartUnix ?? null,
      a11yKey,
    ],
    queryFn: async () => {
      const res = await soft(() =>
        planFn({
          data: {
            from: { lat: origin!.lat, lng: origin!.lng, label: origin!.label },
            to: { lat: kapnos!.pickup.lat, lng: kapnos!.pickup.lng, label: kapnos!.pickup.name },
            arriveByUnix: coachDepartUnix,
            a11y,
          },
        }),
      );
      return res?.itineraries[0] ?? null;
    },
    enabled: !!origin && !!kapnos && pickupFar,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const lastMileQuery = useQuery({
    queryKey: [
      "kapnos.lastMile",
      kapnos?.dropoff.lat,
      kapnos?.dropoff.lng,
      destination?.lat,
      destination?.lng,
      coachArriveUnix ?? null,
      a11yKey,
    ],
    queryFn: async () => {
      const res = await soft(() =>
        planFn({
          data: {
            from: {
              lat: kapnos!.dropoff.lat,
              lng: kapnos!.dropoff.lng,
              label: kapnos!.dropoff.name,
            },
            to: { lat: destination!.lat, lng: destination!.lng, label: destination!.label },
            departAtUnix: coachArriveUnix,
            a11y,
          },
        }),
      );
      return res?.itineraries[0] ?? null;
    },
    enabled: !!destination && !!kapnos && dropoffFar,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const firstMile = firstMileQuery.data ?? null;
  const lastMile = lastMileQuery.data ?? null;

  return {
    parkAndRide: pnrQuery.data ?? null,
    lastMileChain: chainQuery.data ?? null,
    firstMileChain:
      firstWalk && firstWalk.walkMeters >= FIRST_MILE_BOLT_METERS ? (firstChainQuery.data ?? null) : null,
    trafficReport: trafficQuery.data ?? null,
    bikeShare: bikeQuery.data ?? null,
    boltScooter: boltQuery.data ?? null,
    dustAdvisory: dustQuery.data ?? null,
    kapnos,
    kapnosFirstMile: firstMile,
    kapnosLastMile: lastMile,
    kapnosFirstMileLoading: pickupFar && firstMileQuery.isFetching && !firstMile,
    kapnosLastMileLoading: dropoffFar && lastMileQuery.isFetching && !lastMile,
  };
}
