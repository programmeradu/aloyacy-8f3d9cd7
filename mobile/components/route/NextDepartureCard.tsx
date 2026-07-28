// Dark hero card on the route screen: the live status of the soonest run.
// All copy comes from @aloya/core/route-board so web and native stay in sync.

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  nextDepartureCopy,
  type BoardStop,
  type BoardTrip,
  type BusOnLine,
} from "@aloya/core/route-board";

import { palette } from "@/constants/theme";
import { MONO_KICKER } from "./RouteChrome";

export function NextDepartureCard({
  trip,
  liveBus,
  stopOf,
  stopIds,
}: {
  trip: BoardTrip;
  liveBus?: BusOnLine | null;
  stopOf: (id: string) => BoardStop | undefined;
  stopIds: string[];
}) {
  const copy = nextDepartureCopy({
    nextStopName: stopOf(trip.nextArrival.stopId)?.name,
    terminusName: stopOf(trip.lastStop.stopId)?.name,
    arrivalUnix: trip.nextArrival.arrivalUnix,
    liveBus,
    liveBusStopName: liveBus ? stopOf(stopIds[liveBus.stopIndex])?.name : undefined,
  });

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${copy.kicker}. ${copy.headline}`}
        onPress={() => {
          void Haptics.selectionAsync();
          router.push(`/trip-info/${trip.tripId}`);
        }}
        style={({ pressed }) => ({
          borderRadius: 24,
          backgroundColor: palette.ink,
          padding: 20,
          transform: [{ scale: pressed ? 0.995 : 1 }],
        })}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flexShrink: 1,
            }}
          >
            {copy.isLive && (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: palette.ochre,
                }}
              />
            )}
            <Text
              style={[
                MONO_KICKER,
                { color: copy.isLive ? palette.ochre : "rgba(246,241,231,0.6)", flexShrink: 1 },
              ]}
            >
              {copy.kicker}
            </Text>
          </View>
          <Text style={[MONO_KICKER, { color: palette.ochre }]}>{copy.pill}</Text>
        </View>
        <Text
          style={{
            marginTop: 12,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 26,
            lineHeight: 30,
            color: palette.limestone,
            letterSpacing: -0.6,
          }}
        >
          {copy.headline}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_700Bold",
            fontSize: 11,
            letterSpacing: 1.6,
            color: "rgba(246,241,231,0.7)",
          }}
        >
          {copy.footer.toUpperCase()}
        </Text>
      </Pressable>
    </View>
  );
}
