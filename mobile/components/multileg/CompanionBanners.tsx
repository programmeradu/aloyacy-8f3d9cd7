import { View } from "react-native";
import {
  companionBanners,
  shouldAskStillOnBoard,
  shouldOfferSighting,
} from "@aloya/core/multileg-banners";
import { SightingButton } from "@/components/SightingButton";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";
import { BannerCard } from "./LegTimelineRow";

export function CompanionBanners({ live }: { live: MultiLegLive }) {
  const banners = companionBanners({
    active: live.active,
    phase: live.phase,
    tripGhost: !!live.tripGhost,
    vehicleLost: !!live.vehicleLost,
    feedStale: !!live.feedStale,
    hasNextRide: !!live.nextRideLeg,
    nextRouteShort: live.nextRideLeg?.routeShort ?? null,
    nextVehicleTracked: !!live.nextVehicleTracked,
  });

  const offerSighting =
    !!live.currentRideLeg &&
    shouldOfferSighting({
      active: live.active,
      phase: live.phase,
      tripGhost: !!live.tripGhost,
      hasCurrentRide: !!live.currentRideLeg,
      metersToTarget: live.metersToTarget,
    });

  const askOnBoard =
    !!live.currentRideLeg &&
    shouldAskStillOnBoard({
      active: live.active,
      phase: live.phase,
      tripGhost: !!live.tripGhost,
      vehicleLost: !!live.vehicleLost,
      hasCurrentRide: !!live.currentRideLeg,
    });

  return (
    <>
      {banners.map((b) => (
        <BannerCard key={b.id} tone={b.tone} title={b.title} body={b.body} />
      ))}

      {offerSighting && live.currentRideLeg && (
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <SightingButton
            tripId={live.currentRideLeg.tripId}
            routeId={live.currentRideLeg.routeId}
            stopId={live.currentRideLeg.board.stopId}
            lat={live.currentRideLeg.board.lat}
            lng={live.currentRideLeg.board.lng}
          />
        </View>
      )}
      {askOnBoard && live.currentRideLeg && (
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <SightingButton
            kind="onboard"
            tripId={live.currentRideLeg.tripId}
            routeId={live.currentRideLeg.routeId}
            routeShort={live.currentRideLeg.routeShort}
            stopId={live.currentRideLeg.board.stopId}
            lat={live.fusedCurrentVehicle?.lat ?? live.currentRideLeg.board.lat}
            lng={live.fusedCurrentVehicle?.lng ?? live.currentRideLeg.board.lng}
          />
        </View>
      )}
    </>
  );
}