// Native mirror of `src/components/LongFinalWalkHint.tsx`. Renders only
// when the final walk to destination is ≥ 1.2 km — one editorial line +
// a single tap-out to Google Maps for the walk. No taxi CTA (see web
// rationale). Time-of-day/warmth-aware copy mirrors the web build.

import { useMemo } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";

type LatLng = { lat: number; lng: number };
const LONG_WALK_THRESHOLD_M = 1200;

function buildLine(distanceM: number, durationSec: number, dest?: string): string {
  const km = distanceM / 1000;
  const min = Math.max(1, Math.round(durationSec / 60));
  const hour = new Date().getHours();
  const where = dest ? `to ${dest}` : "to your destination";
  if (km >= 2.5) return `A proper hike — ${min} min ${where}. Pace yourself and keep water on hand.`;
  if (km >= 1.8) {
    if (hour >= 21 || hour < 6)
      return `${min} min ${where} in the dark. Stick to lit streets and let someone know.`;
    return `${min} min ${where} — a real walk. Comfortable shoes and steady pace.`;
  }
  if (hour >= 12 && hour < 16)
    return `${min} min ${where}. Warm hour — shade side of the street where you can.`;
  if (hour >= 21 || hour < 6)
    return `${min} min ${where}. Well-lit route works best at this hour.`;
  return `${min} min ${where}. A pleasant stretch to finish.`;
}

export function LongFinalWalkHint({
  from,
  to,
  distanceMeters,
  durationSec,
  destinationLabel,
}: {
  from: LatLng;
  to: LatLng;
  distanceMeters: number;
  durationSec: number;
  destinationLabel?: string;
}) {
  const line = useMemo(
    () => buildLine(distanceMeters, durationSec, destinationLabel),
    [distanceMeters, durationSec, destinationLabel],
  );

  if (distanceMeters < LONG_WALK_THRESHOLD_M) return null;
  const km = (distanceMeters / 1000).toFixed(1);
  const walkingUrl = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=walking`;

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <View
        style={{
          backgroundColor: "#FFF3D9",
          borderRadius: 26,
          borderWidth: 1,
          borderColor: palette.ochre + "55",
          paddingHorizontal: 20,
          paddingVertical: 16,
          gap: 8,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: palette.ochre,
          }}
        >
          Long walk ahead
        </Text>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 22,
            lineHeight: 26,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          The last stretch is{" "}
          <Text style={{ color: palette.ochre }}>{km} km</Text>
          {destinationLabel ? ` to ${destinationLabel}` : ""}.
        </Text>
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          {line}
        </Text>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            void Linking.openURL(walkingUrl);
          }}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            marginTop: 4,
            backgroundColor: palette.ink,
            paddingHorizontal: 16,
            paddingVertical: 9,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 12,
              color: palette.limestone,
            }}
          >
            Open walk in Maps  ↗
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
