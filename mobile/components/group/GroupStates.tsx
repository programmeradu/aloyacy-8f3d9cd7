// Explainer, loading skeleton and the missing/expired group state.

import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { palette } from "@/constants/theme";

export function HowThisWorks() {
  const items = [
    { k: "Location", v: "Only shared with people in this group, only while the trip is live." },
    { k: "Identity", v: "Anyone can join — no account needed. Names are what people see." },
    { k: "ETA", v: "Computed from your live position using Google Routes. It updates as you move." },
    { k: "End", v: "The host can end the trip. It also expires automatically after 6 hours." },
  ];
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: palette.inkSoft,
        }}
      >
        How this works
      </Text>
      <View style={{ marginTop: 12, gap: 10 }}>
        {items.map((it) => (
          <View key={it.k} style={{ flexDirection: "row", gap: 12 }}>
            <Text
              style={{
                width: 78,
                fontFamily: "Geist_700Bold",
                fontSize: 12,
                color: palette.ink,
              }}
            >
              {it.k}
            </Text>
            <Text style={{ flex: 1, fontFamily: "Geist_500Medium", fontSize: 12, lineHeight: 18, color: palette.inkSoft }}>
              {it.v}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ——————————————————————————— Skeleton / missing ——————————————————————————— */

export function SkeletonCard() {
  return (
    <View
      style={{
        height: 120,
        backgroundColor: palette.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    />
  );
}

export function MissingState({ code }: { code: string }) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 32, gap: 12 }}>
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
          Group not found
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
          {code ? `We couldn't find "${code}".` : "No code in the link."}
        </Text>
        <Text style={{ marginTop: 8, fontFamily: "Geist_500Medium", fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          Group links expire after the trip ends. Ask the host to start a new one.
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: palette.ink,
            alignItems: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: "Geist_700Bold", fontSize: 13, color: palette.white }}>Back to Aloya</Text>
        </Pressable>
      </View>
    </View>
  );
}
