// Companion top bar: back, "Live trip" kicker, and end-trip.

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { KICKER } from "./kit";

export function TripHeader({ onEnd }: { onEnd: () => void }) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
      }}
    >
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)/plan")
        }
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 16,
            color: palette.ink,
            marginTop: -2,
          }}
        >
          ←
        </Text>
      </Pressable>

      <Text style={{ ...KICKER, color: palette.aegeanDeep }}>Live trip</Text>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onEnd();
        }}
        accessibilityRole="button"
        accessibilityLabel="End this trip"
        hitSlop={8}
        style={({ pressed }) => ({
          backgroundColor: palette.ink,
          paddingHorizontal: 14,
          minHeight: 40,
          justifyContent: "center",
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
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
