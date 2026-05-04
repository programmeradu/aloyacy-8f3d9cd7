// Editorial Pro-features upsell — mirrors
// `src/components/ProFeaturesUpsell.tsx`. Non-Pro riders see this on
// screens like Saved to understand what Pro adds. Opens the paywall.

import { Pressable, Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { paywallStore } from "@/lib/paywall-store";
import { useProSubscription } from "@/lib/usePro";

const FEATURES = [
  {
    k: "01",
    t: "Quiet, precise alerts",
    d: "Only ping when the plan actually changes. No spam.",
  },
  {
    k: "02",
    t: "Offline schedules",
    d: "Whole-island timetables saved on your phone for zero-signal moments.",
  },
];

export function ProFeaturesUpsell() {
  const { isPro, loading } = useProSubscription();
  if (loading || isPro) return null;

  return (
    <View
      style={{
        borderRadius: 28,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        paddingHorizontal: 22,
        paddingVertical: 24,
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          letterSpacing: 2.4,
          color: palette.inkSoft,
          textTransform: "uppercase",
        }}
      >
        Aloya Pro
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 24,
          lineHeight: 28,
          letterSpacing: -0.5,
          color: palette.ink,
        }}
      >
        The parts of Aloya that <Text style={{ color: palette.aegeanDeep, fontStyle: "italic" }}>save you time</Text>.
      </Text>

      <View style={{ marginTop: 18, gap: 10 }}>
        {FEATURES.map((f) => (
          <View
            key={f.k}
            style={{
              borderRadius: 18,
              backgroundColor: "rgba(250,247,240,0.7)",
              borderWidth: 1,
              borderColor: palette.line,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 2.4,
                color: palette.inkSoft,
              }}
            >
              {f.k}
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: "BricolageGrotesque_700Bold",
                fontSize: 17,
                lineHeight: 22,
                color: palette.ink,
              }}
            >
              {f.t}
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: "Geist_500Medium",
                fontSize: 12,
                lineHeight: 17,
                color: palette.inkSoft,
              }}
            >
              {f.d}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{
          marginTop: 22,
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <Pressable
          onPress={() => paywallStore.open()}
          style={({ pressed }) => ({
            backgroundColor: palette.ink,
            borderRadius: 999,
            paddingHorizontal: 20,
            paddingVertical: 11,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 13,
              color: palette.limestone,
            }}
          >
            See plans
          </Text>
        </Pressable>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Cancel anytime
        </Text>
      </View>
    </View>
  );
}
