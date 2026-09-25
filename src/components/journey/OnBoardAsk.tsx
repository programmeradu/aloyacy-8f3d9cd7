import { SightingButton } from "@/components/SightingButton";
import { getStop } from "@/lib/gtfs";
import { shouldAskStillOnBoard } from "@aloya/core/multileg-banners";
import { useSparseSeedIds } from "@/lib/useSparseSeeds";
import type { ActiveTrip } from "@/lib/trip-store";
import type { LiveJourney } from "@/lib/useJourney";

export function OnBoardAsk({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  const seeds = useSparseSeedIds();
  if (!bus || bus.kind !== "bus") return null;
  if (
    !shouldAskStillOnBoard({
      active: live.active,
      phase: live.phase,
      tripGhost: live.tripGhost,
      vehicleLost: live.vehicleLost,
      hasCurrentRide: true,
    })
  ) {
    return null;
  }
  const s = getStop(bus.board.stopId);
  const lat = live.fusedVehicle?.lat ?? s?.lat;
  const lng = live.fusedVehicle?.lng ?? s?.lng;
  if (lat == null || lng == null) return null;
  return (
    <div className="px-6">
      <SightingButton
        kind="onboard"
        tripId={bus.tripId}
        routeId={bus.routeId}
        routeShort={bus.routeShort}
        stopId={bus.board.stopId}
        lat={lat}
        lng={lng}
        needEyes={seeds.has(bus.routeId)}
      />
    </div>
  );
}
