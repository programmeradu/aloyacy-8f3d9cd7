// Compact Pro upsell card + inline pill — mirrors
// `src/components/ProUpsell.tsx` (ProUpsellCard + GoProInline).

import { Pressable, Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { paywallStore } from "@/lib/paywall-store";
import { useProSubscription } from "@/lib/usePro";

export function ProUpsellCard() {
  const { isPro, loading } = useProSubscription();
  if (loading || isPro) return null;

  return (
    <View
      style={{
        backgroundColor: palette.ink,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 11,
            letterSpacing: 1.6,
            color: "rgba(250,247,240,0.7)",
          }}
        >
          Aloya <Text style={{ color: palette.ochre }}>Pro</Text>
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 17,
            lineHeight: 21,
            letterSpacing: -0.3,
            color: palette.limestone,
          }}
        >
          Quieter alerts.{" "}
          <Text style={{ color: "rgba(250,247,240,0.55)" }}>
            Faster planning.
          </Text>
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_500Medium",
            fontSize: 11.5,
            color: "rgba(250,247,240,0.55)",
          }}
        >
          From <Text style={{ color: "rgba(250,247,240,0.8)" }}>€1.99</Text>/wk · cancel anytime
        </Text>
      </View>
      <Pressable
        onPress={() => paywallStore.open()}
        style={({ pressed }) => ({
          backgroundColor: palette.limestone,
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 9,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 12.5,
            color: palette.ink,
          }}
        >
          Try Pro
        </Text>
      </Pressable>
    </View>
  );
}

export function GoProInline({ label = "Unlock" }: { label?: string }) {
  const { isPro } = useProSubscription();
  if (isPro) return null;
  return (
    <Pressable
      onPress={() => paywallStore.open()}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        backgroundColor: "#FFF3D9",
        borderWidth: 1,
        borderColor: palette.ochre + "55",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_600SemiBold",
          fontSize: 11,
          color: palette.ochre,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
