// Hero image, title, and the floating back/share chips for a shared plan.

import { View, Text, Image, Pressable } from "react-native";
import { palette } from "@/constants/theme";
import type { PlanShare } from "@aloya/core/plan-share";

export const PLAN_HERO =
  "https://app.aloya.cy/__l5e/assets-v1/852729ae-901a-476c-9b8f-0a68b9924687/plan-share-hero.jpg";

export function Hero({ plan, isLoading }: { plan: PlanShare | null; isLoading: boolean }) {
  return (
    <View style={{ height: 340, position: "relative", backgroundColor: palette.limestoneSoft }}>
      <Image
        source={{ uri: PLAN_HERO }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", opacity: 0.92 }}
        resizeMode="cover"
      />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 200, backgroundColor: palette.limestone, opacity: 0.72 }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 100, backgroundColor: palette.limestone }} />

      <View style={{ position: "absolute", left: 20, right: 20, bottom: 22 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.inkSoft,
          }}
        >
          A trip plan on Aloya
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 32,
            lineHeight: 36,
            letterSpacing: -0.6,
            color: palette.ink,
          }}
          numberOfLines={3}
        >
          {isLoading
            ? "Loading plan…"
            : plan
              ? `${plan.origin_label} → ${plan.destination_label}`
              : "Plan not found"}
        </Text>
      </View>
    </View>
  );
}

export function BackChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(246,241,231,0.92)",
        borderWidth: 1,
        borderColor: palette.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: "Geist_700Bold", fontSize: 12, color: palette.ink }}>‹ Back</Text>
    </Pressable>
  );
}

export function ShareChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: palette.ink,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontFamily: "Geist_700Bold", fontSize: 12, color: palette.white }}>Share</Text>
    </Pressable>
  );
}
