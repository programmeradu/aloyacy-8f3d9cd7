// "Today's runs" list — upcoming trips on this line from the live feed.

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  boardClock,
  minutesFromNow,
  terminusLabel,
  type BoardStop,
  type RouteBoard,
} from "@aloya/core/route-board";

import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { MONO_KICKER, SectionHeader } from "./RouteChrome";

export function RouteRunsList({
  board,
  stopOf,
}: {
  board: RouteBoard;
  stopOf: (id: string) => BoardStop | undefined;
}) {
  const runs = board.trips.slice(1, 6);
  if (runs.length === 0) return null;

  return (
    <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
      <SectionHeader title="Today's runs" kicker="FROM LIVE FEED" />
      <Card style={{ overflow: "hidden", padding: 0 }}>
        {runs.map((trip, i) => {
          const live = board.vehicles.some((v) => v.tripId === trip.tripId);
          const dest = terminusLabel(stopOf(trip.lastStop.stopId)?.name);
          return (
            <Pressable
              key={trip.tripId}
              accessibilityRole="button"
              onPress={() => {
                void Haptics.selectionAsync();
                router.push(`/trip-info/${trip.tripId}`);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: i === runs.length - 1 ? 0 : 1,
                borderBottomColor: palette.line,
                backgroundColor: pressed ? palette.limestoneSoft : "transparent",
              })}
            >
              <Text
                style={{
                  fontFamily: "BricolageGrotesque_800ExtraBold",
                  fontSize: 22,
                  color: palette.ink,
                  width: 72,
                  letterSpacing: -0.4,
                }}
              >
                {boardClock(trip.nextArrival.arrivalUnix)}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: "BricolageGrotesque_700Bold",
                    fontSize: 15,
                    color: palette.ink,
                  }}
                >
                  {stopOf(trip.nextArrival.stopId)?.name ?? "Next stop"}
                </Text>
                <View
                  style={{
                    marginTop: 3,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {live && (
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        backgroundColor: palette.ochre,
                      }}
                    />
                  )}
                  <Text
                    style={[
                      MONO_KICKER,
                      {
                        flexShrink: 1,
                        fontSize: 9,
                        letterSpacing: 1.6,
                        color: live ? palette.ochre : palette.inkSoft,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {live ? "LIVE NOW" : "SCHEDULED"}  ·  TO {dest.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  MONO_KICKER,
                  { fontSize: 10, color: palette.inkSoft, letterSpacing: 1.8 },
                ]}
              >
                {minutesFromNow(trip.nextArrival.arrivalUnix).toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}
