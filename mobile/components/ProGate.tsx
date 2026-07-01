// Native ProGate — wraps Pro-only content. Non-Pro users see an optional
// blurred preview (via reduced opacity) with an unlock CTA that opens
// the global PaywallSheet. Mirror of `src/components/ProGate.tsx`.

import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { useProSubscription } from "@/lib/usePro";
import { paywallStore } from "@/lib/paywall-store";

export function ProGate({
  feature,
  children,
  preview,
}: {
  feature: string;
  children: ReactNode;
  preview?: ReactNode;
}) {
  const { isPro, loading } = useProSubscription();
  if (loading) return null;
  if (isPro) return <>{children}</>;

  return (
    <View
      style={{
        position: "relative",
        borderRadius: 28,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.white,
        overflow: "hidden",
      }}
    >
      {preview ? (
        <View pointerEvents="none" style={{ opacity: 0.35 }}>
          {preview}
        </View>
      ) : (
        <View style={{ height: 96, backgroundColor: palette.aegeanSoft ?? "#E8F1F1" }} />
      )}
      <View
        style={{
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: 24,
          backgroundColor: "rgba(250,247,240,0.55)",
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
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 19,
            lineHeight: 23,
            letterSpacing: -0.4,
            color: palette.ink,
            textAlign: "center",
            maxWidth: 260,
          }}
        >
          {feature}
        </Text>
        <Pressable
          onPress={() => paywallStore.open()}
          style={({ pressed }) => ({
            marginTop: 4,
            backgroundColor: palette.ink,
            borderRadius: 999,
            paddingHorizontal: 20,
            paddingVertical: 10,
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
            Unlock from €1.99/wk
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
