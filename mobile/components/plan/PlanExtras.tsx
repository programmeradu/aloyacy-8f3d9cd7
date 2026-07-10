import { View, Text } from "react-native";

import type { Itinerary } from "@/lib/plan";
import type { PickedPlace } from "@/components/PlacesAutocomplete";
import {
  BikeShareCardMobile,
  BoltScooterCardMobile,
  LastMileChainCardMobile,
} from "@/components/AltModeCards";
import { ParkAndRideCardMobile } from "@/components/ParkAndRideCardMobile";
import { KapnosShuttleCardMobile } from "@/components/KapnosShuttleCardMobile";
import { TrafficAlertsCardMobile } from "@/components/TrafficAlertsCardMobile";
import { planStyles } from "./styles";
import type { PlanAlternates } from "@/lib/usePlanQueries";

/**
 * Everything that sits below the ranked itineraries: Park & Ride, the Kapnos
 * coach with its bus-based first/last mile, live traffic, and the alt modes.
 */
export function PlanExtras({
  alternates,
  hasPlan,
  origin,
  destination,
  onStartItinerary,
}: {
  alternates: PlanAlternates;
  hasPlan: boolean;
  origin: PickedPlace;
  destination: PickedPlace | null;
  onStartItinerary: (itinerary: Itinerary, from: PickedPlace, to: PickedPlace) => void;
}) {
  const { pnr, kapnos, bike, bolt, chain, trafficReport, kapnosMiles } = alternates;

  return (
    <>
      {pnr && hasPlan && (
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <ParkAndRideCardMobile suggestion={pnr} origin={{ lat: origin.lat, lng: origin.lng }} />
        </View>
      )}

      {kapnos && (
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <KapnosShuttleCardMobile
            suggestion={kapnos}
            firstMile={kapnosMiles.firstMile}
            lastMile={kapnosMiles.lastMile}
            firstMileLoading={kapnosMiles.firstMileLoading}
            lastMileLoading={kapnosMiles.lastMileLoading}
            onPlanFirstMile={
              kapnosMiles.firstMile
                ? () =>
                    onStartItinerary(kapnosMiles.firstMile!, origin, {
                      lat: kapnos.pickup.lat,
                      lng: kapnos.pickup.lng,
                      label: kapnos.pickup.name,
                    })
                : undefined
            }
            onPlanLastMile={
              kapnosMiles.lastMile && destination
                ? () =>
                    onStartItinerary(
                      kapnosMiles.lastMile!,
                      {
                        lat: kapnos.dropoff.lat,
                        lng: kapnos.dropoff.lng,
                        label: kapnos.dropoff.name,
                      },
                      destination,
                    )
                : undefined
            }
          />
        </View>
      )}

      {trafficReport && (
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <TrafficAlertsCardMobile report={trafficReport} />
        </View>
      )}

      {hasPlan && (bike || bolt || chain) && (
        <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 12 }}>
          <Text style={planStyles.sectionLabel}>OTHER WAYS</Text>
          {bike && <BikeShareCardMobile s={bike} />}
          {bolt && <BoltScooterCardMobile s={bolt} />}
          {chain && <LastMileChainCardMobile s={chain} />}
        </View>
      )}
    </>
  );
}
