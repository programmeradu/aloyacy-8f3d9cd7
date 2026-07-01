// Mobile Share Plan button — mints a public /plan/:token snapshot of a
// planned itinerary so a group can coordinate before anyone leaves,
// then opens the native share sheet.

import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Share, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import type { Itinerary } from "@/lib/plan";

const PUBLIC_BASE = "https://app.aloya.cy";

type Point = { lat: number; lng: number; label: string };

export function SharePlanButtonMobile({
  itinerary,
  origin,
  destination,
}: {
  itinerary: Itinerary;
  origin: Point;
  destination: Point;
}) {
  const [state, setState] = useState<"idle" | "creating" | "ready">("idle");
  const [url, setUrl] = useState<string | null>(null);

  const onPress = useCallback(async () => {
    void Haptics.selectionAsync();
    let shareUrl = url;
    if (!shareUrl) {
      setState("creating");
      try {
        const res = await fetch(`${API_BASE}/api/public/plan-share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originLabel: origin.label,
            originLat: origin.lat,
            originLng: origin.lng,
            destinationLabel: destination.label,
            destinationLat: destination.lat,
            destinationLng: destination.lng,
            departureUnix: Math.floor(itinerary.departureUnix),
            arrivalUnix: Math.floor(itinerary.arrivalUnix),
            totalDurationSec: Math.floor(itinerary.totalDurationSec),
            transfers: itinerary.transfers,
            legs: itinerary.legs,
          }),
        });
        if (!res.ok) throw new Error(`share ${res.status}`);
        const { token } = (await res.json()) as { token: string };
        shareUrl = `${PUBLIC_BASE}/plan/${token}`;
        setUrl(shareUrl);
        setState("ready");
      } catch {
        setState("idle");
        Alert.alert("Couldn't create link", "Check your connection and try again.");
        return;
      }
    }
    try {
      await Share.share({
        message: `Here's our plan to get to ${destination.label}: ${shareUrl}`,
        url: shareUrl!,
      });
    } catch {
      await Clipboard.setStringAsync(shareUrl!);
      Alert.alert("Link copied", shareUrl!);
    }
  }, [url, origin, destination, itinerary]);

  const label =
    state === "creating"
      ? "Making link…"
      : state === "ready"
        ? "Share again"
        : "Share this plan";

  return (
    <Pressable
      onPress={onPress}
      disabled={state === "creating"}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.icon}>
        <Text style={styles.iconGlyph}>↗</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.sub}>
          {state === "ready"
            ? "Anyone with the link sees the meeting stop, bus, and time."
            : "For groups — no install needed"}
        </Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: palette.white,
    borderColor: palette.line,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.limestoneSoft,
  },
  iconGlyph: {
    fontFamily: "Geist_700Bold",
    fontSize: 16,
    color: palette.ink,
    lineHeight: 18,
  },
  label: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15,
    color: palette.ink,
  },
  sub: {
    marginTop: 2,
    fontFamily: "Geist_500Medium",
    fontSize: 11,
    letterSpacing: 0.4,
    color: palette.inkSoft,
  },
  chev: {
    fontFamily: "Geist_500Medium",
    fontSize: 22,
    color: palette.inkSoft,
  },
});
