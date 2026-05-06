// Group-trip button — sits under ShareEtaButton on the companion. First
// tap creates a group and shares the invite; subsequent taps re-open
// the share sheet. Long-press to leave.

import { useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Share, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { palette } from "@/constants/theme";
import { useGroupTrip } from "@/lib/useGroupTrip";
import type { ActiveTrip } from "@/lib/trip-store";

export function GroupTripButton({
  active,
  fix,
  etaMinutes,
}: {
  active: ActiveTrip;
  fix: { lat: number; lng: number } | null;
  etaMinutes: number | null;
}) {
  const { session, create, leave, busy } = useGroupTrip({ active, fix, etaMinutes });

  const onPress = useCallback(async () => {
    void Haptics.selectionAsync();
    let s = session;
    if (!s) {
      s = await create();
      if (!s) {
        Alert.alert("Couldn't start group", "Check your connection and try again.");
        return;
      }
    }
    const message = `Join my trip to ${active.to.label} on Aloya. Code ${s.code}\n${s.url}`;
    try {
      await Share.share({ message, url: s.url });
    } catch {
      await Clipboard.setStringAsync(s.url);
      Alert.alert("Link copied", s.url);
    }
  }, [session, create, active.to.label]);

  const onLongPress = useCallback(() => {
    if (!session) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Leave group?", "Others won't see your live position anymore.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => void leave() },
    ]);
  }, [session, leave]);

  const isLive = !!session;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        isLive ? styles.buttonLive : styles.buttonIdle,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.codeBadge}>
        <Text style={[styles.codeBadgeLabel, isLive && { color: palette.ink }]}>
          {isLive ? session!.code : "NEW"}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, isLive && { color: palette.ink }]}>
          {isLive ? "Group trip live" : "Start group trip"}
        </Text>
        <Text style={[styles.sub, isLive && { color: "rgba(0,0,0,0.55)" }]}>
          {busy
            ? "Starting group…"
            : isLive
              ? "Tap to invite · long-press to leave"
              : "Everyone converging on one place"}
        </Text>
      </View>
      <Text style={[styles.chev, isLive && { color: palette.ink }]}>›</Text>
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
    marginTop: 10,
    borderWidth: 1,
  },
  buttonIdle: {
    backgroundColor: palette.white,
    borderColor: palette.line,
  },
  buttonLive: {
    backgroundColor: palette.ochreSoft ?? "#F7E7BF",
    borderColor: palette.ochreSoft ?? "#F7E7BF",
  },
  codeBadge: {
    minWidth: 46,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBadgeLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.white,
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
