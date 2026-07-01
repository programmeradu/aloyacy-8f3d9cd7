// Mobile mirror of `src/components/DisruptionBanner.tsx`. Renders the
// active DisruptionSignal as an editorial card at the top of the
// companion, with an optional "Find faster route" CTA that seeds the
// planner with the current destination and hands off.

import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import type { DisruptionSignal } from "@/lib/useDisruptionWatch";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";

const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

export function DisruptionBanner({
  signal,
  active,
  onReplan: onReplanProp,
}: {
  signal: DisruptionSignal | null;
  active: ActiveTrip | null;
  /** When provided, invoked instead of the default "jump to planner"
   *  action — lets the companion open an inline replan sheet. */
  onReplan?: () => void;
}) {
  if (!signal || !active) return null;

  const tone =
    signal.kind === "vehicle-lost-feed"
      ? "neutral"
      : signal.kind === "missed-connection"
        ? "ochre-strong"
        : signal.kind === "connection-at-risk" || signal.kind === "late-pre-board"
          ? "ochre"
          : "aegean";

  const bg =
    tone === "neutral"
      ? palette.white
      : tone === "ochre-strong" || tone === "ochre"
        ? palette.ochreSoft
        : palette.aegeanSoft;
  const border =
    tone === "neutral"
      ? palette.line
      : tone === "ochre-strong"
        ? "rgba(201,133,58,0.55)"
        : tone === "ochre"
          ? "rgba(201,133,58,0.40)"
          : "rgba(63,155,178,0.30)";
  const eyebrow =
    tone === "neutral"
      ? palette.inkSoft
      : tone === "ochre-strong" || tone === "ochre"
        ? palette.ochre
        : palette.aegeanDeep;

  const onReplan = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    if (onReplanProp) {
      onReplanProp();
      return;
    }
    try {
      await AsyncStorage.setItem(
        "aloya:nl-plan",
        JSON.stringify({
          from: null,
          to: {
            label: active.to.label,
            lat: active.to.lat,
            lng: active.to.lng,
          },
          leaveByISO: null,
          arriveByISO: null,
          rawText: `Faster route to ${active.to.label}`,
        }),
      );
    } catch {}
    clearActiveTrip();
    router.replace("/(tabs)/plan");
  };

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <View
        style={{
          borderRadius: 24,
          padding: 18,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
        }}
      >
        <Text style={{ ...KICKER, color: eyebrow }}>{eyebrowLabel(signal.kind)}</Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 20,
            lineHeight: 24,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          {signal.title}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "Geist_500Medium",
            fontSize: 13.5,
            lineHeight: 20,
            color: palette.inkSoft,
          }}
        >
          {signal.body}
        </Text>
        {signal.suggestReplan && (
          <Pressable
            onPress={onReplan}
            style={({ pressed }) => ({
              marginTop: 14,
              alignSelf: "flex-start",
              backgroundColor: palette.ink,
              paddingHorizontal: 16,
              paddingVertical: 11,
              borderRadius: 999,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 13,
                color: palette.limestone,
                letterSpacing: -0.2,
              }}
            >
              Find faster route  →
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function eyebrowLabel(kind: DisruptionSignal["kind"]): string {
  switch (kind) {
    case "running-late":
      return "Running late";
    case "connection-at-risk":
      return "Connection at risk";
    case "missed-connection":
      return "Missed connection";
    case "vehicle-lost-feed":
      return "Live feed down";
    case "ghost-pre-board":
      return "No GPS from this bus";
    case "late-pre-board":
      return "Bus is late";
  }
}
