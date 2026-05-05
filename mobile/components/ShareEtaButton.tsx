// Share-my-ETA button — sits inside the companion. Tap once to mint a
// public link, tap again to open the native share sheet. Long-press to
// end the share.

import { useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Share, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { palette } from "@/constants/theme";
import { useShareEta } from "@/lib/useShareEta";
import type { ActiveTrip } from "@/lib/trip-store";

export function ShareEtaButton({
  active,
  fix,
  etaMinutes,
}: {
  active: ActiveTrip;
  fix: { lat: number; lng: number } | null;
  etaMinutes: number | null;
}) {
  const { session, create, stop, creating } = useShareEta({ active, fix, etaMinutes });

  const onPress = useCallback(async () => {
    void Haptics.selectionAsync();
    let s = session;
    if (!s) {
      s = await create();
      if (!s) {
        Alert.alert("Couldn't create link", "Check your connection and try again.");
        return;
      }
    }
    try {
      await Share.share({
        message: `Follow my trip to ${active.to.label}: ${s.url}`,
        url: s.url,
      });
    } catch {
      await Clipboard.setStringAsync(s.url);
      Alert.alert("Link copied", s.url);
    }
  }, [session, create, active.to.label]);

  const onLongPress = useCallback(() => {
    if (!session) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Stop sharing?", "Friends won't see your live position anymore.", [
      { text: "Cancel", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => void stop() },
    ]);
  }, [session, stop]);

  const isLive = !!session;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={creating}
      style={({ pressed }) => [
        styles.button,
        isLive ? styles.buttonLive : styles.buttonIdle,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.dotWrap}>
        {isLive && <View style={styles.pulseDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, isLive && { color: palette.white }]}>
          {isLive ? "Sharing ETA" : "Share my ETA"}
        </Text>
        <Text style={[styles.sub, isLive && { color: "rgba(255,255,255,0.72)" }]}>
          {creating
            ? "Creating link…"
            : isLive
              ? "Tap to send · long-press to stop"
              : `Live link · anyone with it can watch`}
        </Text>
      </View>
      <Text style={[styles.chev, isLive && { color: palette.white }]}>›</Text>
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
    marginTop: 12,
    borderWidth: 1,
  },
  buttonIdle: {
    backgroundColor: palette.white,
    borderColor: palette.line,
  },
  buttonLive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  dotWrap: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.aegeanDeep,
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
