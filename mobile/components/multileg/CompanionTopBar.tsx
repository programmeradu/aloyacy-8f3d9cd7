// Companion top bar: back, ride ordinal, end trip.

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { palette } from "@/constants/theme";
import { changesLabel } from "@aloya/core/multileg-banners";
import { clearActiveTrip } from "@/lib/trip-store";
import { KICKER } from "./kit";

export function CompanionTopBar({
  transfers,
  rideOrdinal,
  totalRides,
}: {
  transfers: number;
  rideOrdinal: number;
  totalRides: number;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 18, color: palette.ink }}>
          ←
        </Text>
      </Pressable>

      <Text
        style={{ ...KICKER, color: palette.inkSoft, flex: 1, textAlign: "center" }}
        numberOfLines={2}
      >
        {changesLabel(transfers)} — ride {Math.max(1, rideOrdinal)}/{totalRides}
      </Text>

      <Pressable
        onPress={() => {
          clearActiveTrip();
          router.replace("/(tabs)/plan");
        }}
        style={({ pressed }) => ({
          backgroundColor: palette.ink,
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 12,
            color: palette.limestone,
            letterSpacing: -0.2,
          }}
        >
          End trip
        </Text>
      </Pressable>
    </View>
  );
}
