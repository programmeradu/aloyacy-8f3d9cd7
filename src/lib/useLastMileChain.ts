import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { suggestLastMileChain } from "@/lib/last-mile-chain.functions";
import type { ActiveTrip } from "@/lib/trip-store";

export interface UseLastMileChainOptions {
  active: ActiveTrip;
}

/**
 * Wave 3 — Last-mile chain hook.
 * When the final walk to destination is long (or moderately long after-hours),
 * pre-fetch a taxi handoff so it's ready the moment the rider hits the
 * walking-to-destination phase.
 */
/** Walks shorter than this are not worth a taxi handoff. */
export const LAST_MILE_MIN_WALK_METERS = 800;

/**
 * Returns the trip's final leg when it is a walk, otherwise null.
 * Exported so the threshold logic is testable without rendering the hook.
 */
export function finalWalkLeg(active: ActiveTrip): WalkLeg | null {
  const legs = active.itinerary?.legs;
  if (!legs || legs.length === 0) return null;
  const last = legs[legs.length - 1];
  return last.kind === "walk" ? last : null;
}

/** True when the final walk is long enough to offer a last-mile handoff. */
export function shouldChainLastMile(active: ActiveTrip): boolean {
  const walk = finalWalkLeg(active);
  return !!walk && walk.distanceMeters >= LAST_MILE_MIN_WALK_METERS;
}

export function useLastMileChain({ active }: UseLastMileChainOptions) {
  const itin = active.itinerary;
  const tripId = active.option.id;
  const chainFn = useServerFn(suggestLastMileChain);

  const finalWalk = finalWalkLeg(active);

  const chainQuery = useQuery({
    queryKey: [
      "lastMileChain",
      tripId,
      finalWalk?.from.lat,
      finalWalk?.from.lng,
      active.to.lat,
      active.to.lng,
      itin?.arrivalUnix,
    ],
    queryFn: async () => {
      if (!finalWalk || !itin) return null;
      if (finalWalk.distanceMeters < 800) return null;
      try {
        return await chainFn({
          data: {
            alight: {
              lat: finalWalk.from.lat,
              lng: finalWalk.from.lng,
              name: finalWalk.from.name,
            },
            destination: {
              lat: active.to.lat,
              lng: active.to.lng,
              name: active.to.label,
            },
            arrivalUnix: itin.arrivalUnix,
            finalWalkMeters: Math.round(finalWalk.distanceMeters),
          },
        });
      } catch {
        return null;
      }
    },
    enabled: !!finalWalk && (finalWalk.distanceMeters ?? 0) >= 800,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  return chainQuery.data ?? null;
}
