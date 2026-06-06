// Share-my-ETA button — sits inside the companion. Tap once to mint a
// public link, tap again to open the native share sheet. Long-press to
// end the share. Styled to match GroupTripButton with a bespoke
// broadcast-pin glyph so it reads as a premium companion feature rather
// than a plain row of text.

import { useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Share, Alert, Animated, Easing } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { palette } from "@/constants/theme";
import { useShareEta } from "@/lib/useShareEta";
import type { ActiveTrip } from "@/lib/trip-store";

// Bespoke "broadcast pin" glyph — a single rider silhouette inside a
// location pin with three concentric arcs radiating outward, i.e. one
// person sharing their live position. Deliberately distinct from
// GroupTripButton's trio-of-friends mark so the two CTAs never blur.
function BroadcastGlyph({ size = 26, color = palette.limestone }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* Radiating signal arcs — three sweeps of increasing radius */}
      <Path
        d="M23 6.5c3.2 2.2 5.2 5.7 5.2 9.7"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.35}
        fill="none"
      />
      <Path
        d="M22 10.5c2 1.6 3.3 4 3.3 6.7"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.55}
        fill="none"
      />
      <Path
        d="M21 14.5c1 .9 1.6 2 1.6 3.3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        opacity={0.8}
        fill="none"
      />
      {/* Pin body — teardrop */}
      <Path
        d="M13 3.5c4.4 0 8 3.4 8 7.6 0 5.6-8 15.4-8 15.4S5 16.7 5 11.1c0-4.2 3.6-7.6 8-7.6Z"
        fill={color}
      />
      {/* Person notch inside the pin (negative space) */}
      <Circle cx={13} cy={10.5} r={2.4} fill={palette.aegeanDeep} />
      <Path
        d="M8.8 15.4c.5-2 2.2-3.2 4.2-3.2s3.7 1.2 4.2 3.2c-1.2 1.1-2.6 1.7-4.2 1.7s-3-.6-4.2-1.7Z"
        fill={palette.aegeanDeep}
      />
    </Svg>
  );
}

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

  // Pulsing halo behind the glyph — reads as "broadcasting" without
  // spelling it out. Same rhythm as GroupTripButton so the two CTAs feel
  // like siblings on the companion.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
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
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={creating}
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
        <BroadcastGlyph />
        {isLive && (
          <View style={styles.livePip}>
            <View style={styles.livePipInner} />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, isLive && { color: palette.ink }]}>
          {isLive ? "Sharing ETA — live" : "Share my ETA"}
        </Text>
        <Text style={[styles.sub, isLive && { color: "rgba(0,0,0,0.6)" }]}>
          {creating
            ? "Creating link…"
            : isLive
              ? "Tap to send · long-press to stop"
              : "Live link · anyone with it can watch"}
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
    marginTop: 12,
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
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: palette.aegeanDeep,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: palette.aegeanDeep,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  halo: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: palette.aegean,
  },
  livePip: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.aegeanDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  livePipInner: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: palette.ochre,
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
