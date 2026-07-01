// Wave 2.6 · Trip chaining — home-screen return-trip suggestion.
//
// Renders only when the rider is at a place they've recently arrived at
// and pickReturnSuggestion agrees a return leg is likely (e.g. the
// afternoon-return half of a morning commute). Tap seeds the planner
// with the reverse trip (same handoff protocol as CommuteSuggestionCard
// and AskAloya).

import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { useReturnSuggestion } from "@/lib/trip-chain";

export function ReturnTripSuggestionCard({
  here,
}: {
  here: { lat: number; lng: number } | null;
}) {
  const suggestion = useReturnSuggestion(here);
  if (!suggestion) return null;

  const onPress = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    try {
      await AsyncStorage.setItem(
        "aloya:nl-plan",
        JSON.stringify({
          from: {
            label: suggestion.from.label,
            lat: suggestion.from.lat,
            lng: suggestion.from.lng,
          },
          to: {
            label: suggestion.to.label,
            lat: suggestion.to.lat,
            lng: suggestion.to.lng,
          },
          leaveByISO: null,
          arriveByISO: null,
          rawText: `${suggestion.from.label} to ${suggestion.to.label}`,
        }),
      );
    } catch {}
    router.push("/(tabs)/plan");
  };

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius: 28,
          backgroundColor: palette.limestone ?? "#f5efe4",
          borderWidth: 1,
          borderColor: "rgba(158,124,60,0.28)",
          paddingVertical: 18,
          paddingHorizontal: 20,
          opacity: pressed ? 0.9 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.ochreDeep ?? palette.ink,
          }}
        >
          {suggestion.reason}
          {suggestion.usualReturnTime
            ? `   ${suggestion.usualReturnTime}`
            : ""}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 26,
            letterSpacing: -0.5,
            color: palette.ink,
          }}
        >
          {suggestion.from.label}
          <Text style={{ color: palette.inkSoft }}>  back to  </Text>
          {suggestion.to.label}
        </Text>
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: palette.inkSoft,
            }}
          >
            Tap to plan the return
          </Text>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 14,
              color: palette.ochreDeep ?? palette.ink,
            }}
          >
            →
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
