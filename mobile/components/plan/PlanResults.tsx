import { View, Text, ActivityIndicator } from "react-native";
import { optionsHeadline } from "@aloya/core/plan-intent";

import { palette } from "@/constants/theme";
import type { Itinerary, PlanResult } from "@/lib/plan";
import type { PickedPlace } from "@/components/PlacesAutocomplete";
import { ItineraryCard } from "@/components/ItineraryCard";
import { RemindMeButtonMobile } from "@/components/RemindMeButtonMobile";
import { SharePlanButtonMobile } from "@/components/SharePlanButtonMobile";
import { planStyles } from "./styles";

/** Copy shown before a destination is chosen. */
export function PlanEmptyState() {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
      <Text style={planStyles.body}>
        Pick a destination to see honest options. We&apos;ll fold in live buses, real walking
        times, the Park &amp; Ride hub when traffic justifies it, and Kapnos coaches if the airport
        is involved.
      </Text>
    </View>
  );
}

export function PlanningIndicator() {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        marginTop: 22,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <ActivityIndicator color={palette.aegean} />
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          color: palette.inkSoft,
          fontSize: 11,
          letterSpacing: 0.5,
        }}
      >
        PLANNING…
      </Text>
    </View>
  );
}

export function PlanErrorNotice() {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          color: palette.ochre,
          fontSize: 13,
          lineHeight: 19,
        }}
      >
        Couldn&apos;t reach the planner. Pull down to try again.
      </Text>
    </View>
  );
}

/** The ranked itinerary list, with remind / share affordances on each option. */
export function PlanResults({
  result,
  origin,
  destination,
  onStart,
}: {
  result: PlanResult;
  origin: PickedPlace;
  destination: PickedPlace | null;
  onStart: (itinerary: Itinerary) => void;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 22, gap: 12 }}>
      <Text style={planStyles.sectionLabel}>
        {optionsHeadline(result.itineraries.length, result.mode)}
      </Text>
      {result.itineraries.length === 0 ? (
        <Text style={planStyles.body}>
          No honest options between these two points right now. Try a nearer place, a different
          time, or change the destination.
        </Text>
      ) : (
        result.itineraries.map((it, idx) => (
          <View key={it.id} style={{ gap: 10 }}>
            <ItineraryCard itinerary={it} onStart={onStart} />
            {idx === 0 && destination && (
              <RemindMeButtonMobile itinerary={it} origin={origin} destination={destination} />
            )}
            {destination && (
              <SharePlanButtonMobile itinerary={it} origin={origin} destination={destination} />
            )}
          </View>
        ))
      )}
    </View>
  );
}
