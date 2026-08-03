// Loading skeleton and the "plan unavailable" state.

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { palette } from "@/constants/theme";

export function SkeletonBlock({ height }: { height: number }) {
  return (
    <View
      style={{
        height,
        backgroundColor: palette.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    />
  );
}

export function MissingState({ token }: { token: string }) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
      <View
        style={{
          backgroundColor: palette.white,
          borderRadius: 24,
          padding: 24,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.ochre,
          }}
        >
          Plan unavailable
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            lineHeight: 26,
            color: palette.ink,
          }}
        >
          This plan link has expired or was removed.
        </Text>
        <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          Plan links stay live for 7 days. Ask whoever sent it to share a new one, or plan the same trip fresh in Aloya.
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)/plan")}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: palette.ink,
            alignItems: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: palette.white }}>Plan a trip</Text>
        </Pressable>
      </View>
      {token ? (
        <Text style={{ marginTop: 12, textAlign: "center", fontFamily: "JetBrainsMono_500Medium", fontSize: 10, letterSpacing: 1.6, color: palette.inkSoft }}>
          Token: {token.slice(0, 6)}…
        </Text>
      ) : null}
    </View>
  );
}
