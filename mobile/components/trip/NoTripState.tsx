// Graceful landing when the companion opens with no live trip — after the
// rider ends one, or once a stored trip has expired.

import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { palette } from "@/constants/theme";
import { KICKER } from "./kit";

export function NoTripState({ topInset }: { topInset: number }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: topInset + 24,
        paddingHorizontal: 20,
        paddingBottom: 48,
      }}
    >
      <Text style={{ ...KICKER, color: palette.aegeanDeep }}>No live trip</Text>
      <Text
        style={{
          marginTop: 10,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 34,
          lineHeight: 38,
          letterSpacing: -0.8,
          color: palette.ink,
        }}
      >
        Your trip has ended.
      </Text>
      <Text
        style={{
          marginTop: 10,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 20,
          color: palette.inkSoft,
        }}
      >
        Plan a new door-to-door trip and we'll walk you through it stop by stop.
      </Text>
      <Pressable
        onPress={() => router.replace("/(tabs)/plan")}
        accessibilityRole="button"
        accessibilityLabel="Plan a new trip"
        style={({ pressed }) => ({
          marginTop: 20,
          alignSelf: "flex-start",
          backgroundColor: palette.ink,
          paddingHorizontal: 22,
          paddingVertical: 14,
          borderRadius: 999,
          minHeight: 48,
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 14,
            color: palette.limestone,
            letterSpacing: -0.2,
          }}
        >
          Plan a new trip
        </Text>
      </Pressable>
    </ScrollView>
  );
}
