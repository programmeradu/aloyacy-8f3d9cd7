// Dest-aware door cost: Kapnos last-mile walk + RAPTOR to the dest.
// Taxi is not quoted here — we have no measured drive on this path.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BOARDING_PAY } from "@aloya/core/boarding-pay";
import {
  doorFromItinerary,
  walkMinFromMeters,
  type AirportDest,
} from "@aloya/core/airport-cost";
import { planMultiLeg } from "@/lib/multileg.functions";
import { suggestKapnos } from "@/lib/kapnos.functions";

export type AirportDoor = {
  coachWalkMin: number | null;
  busDoor: { routeShort: string; waitMin: number; walkMin: number; fareEur: number } | null;
};

export function useAirportDoor(
  from: { lat: number; lng: number; label?: string } | null,
  dest: AirportDest | null,
): { door: AirportDoor | null; pending: boolean } {
  const planFn = useServerFn(planMultiLeg);
  const kapnosFn = useServerFn(suggestKapnos);
  const q = useQuery({
    enabled: !!from && !!dest,
    queryKey: ["airport-door", from?.lat, from?.lng, dest?.lat, dest?.lng],
    staleTime: 60_000,
    queryFn: async (): Promise<AirportDoor> => {
      const [plan, kapnos] = await Promise.all([
        planFn({
          data: {
            from: { lat: from!.lat, lng: from!.lng, label: from!.label },
            to: { lat: dest!.lat, lng: dest!.lng, label: dest!.label },
            mode: "both",
          },
        }).catch(() => null),
        kapnosFn({
          data: { from: { lat: from!.lat, lng: from!.lng }, to: { lat: dest!.lat, lng: dest!.lng } },
        }).catch(() => null),
      ]);
      const nowUnix = Math.floor(Date.now() / 1000);
      const first = plan && "itineraries" in plan ? plan.itineraries[0] : undefined;
      const extracted = first ? doorFromItinerary(first, nowUnix) : null;
      const walkM = kapnos && "dropoff" in kapnos ? kapnos.dropoff.distanceM : null;
      return {
        coachWalkMin: walkM != null ? walkMinFromMeters(walkM) : null,
        busDoor: extracted
          ? { ...extracted, fareEur: BOARDING_PAY.urban.motionEur }
          : null,
      };
    },
  });
  return { door: q.data ?? null, pending: q.isFetching };
}
