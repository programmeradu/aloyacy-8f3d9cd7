// Group-trip button — sits under ShareEtaButton on the companion. First
// tap creates a group and shares the invite; subsequent taps re-open
// the share sheet. Long-press to leave.

import { useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Share, Alert, Animated, Easing } from "react-native";
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

  // Pulsing halo behind the leading dot — makes the CTA read as "live" at
  // a glance rather than "another card".
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        isLive ? styles.buttonLive : styles.buttonIdle,
        pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
      ]}
    >
      <View style={styles.leadIcon}>
        <Animated.View
          style={[
            styles.halo,
            { transform: [{ scale: haloScale }], opacity: haloOpacity },
          ]}
        />
        <View style={styles.dot} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, isLive && { color: palette.ink }]}>
          {isLive ? "Group trip live" : "Watch together — live"}
        </Text>
        <Text style={[styles.sub, isLive && { color: "rgba(0,0,0,0.6)" }]}>
          {busy
            ? "Starting group…"
            : isLive
              ? `Tap to invite · code ${session!.code} · long-press to leave`
              : "Invite friends · one map, real ETAs, no account"}
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
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
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
  leadIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.aegeanDeep,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  halo: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: palette.limestone,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.limestone,
  },
  label: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 15,
    letterSpacing: -0.2,
    color: palette.ink,
  },
  sub: {
    marginTop: 2,
    fontFamily: "Geist_500Medium",
    fontSize: 11.5,
    letterSpacing: 0.2,
    color: palette.inkSoft,
  },
  chev: {
    fontFamily: "Geist_500Medium",
    fontSize: 22,
    color: palette.inkSoft,
  },
});
