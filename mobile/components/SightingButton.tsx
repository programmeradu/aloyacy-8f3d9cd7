// "I see this bus" — rider-confirmed sighting CTA (mobile mirror of
// `src/components/SightingButton.tsx`). One tap POSTs to
// /api/public/sighting; the snapshot pipeline folds it in on the next
// refresh so every rider sees `rider-confirmed` for ~90s.
//
// Uses the stop's own coordinates as the sighting fix — no GPS prompt,
// the rider IS at the stop they're viewing. Persists a per-trip cooldown
// in AsyncStorage so a page bounce can't replay the button.

import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/push";

const COOLDOWN_MS = 60_000;
const PREFIX = "aloya.sighting.";

const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

export function SightingButton({
  tripId,
  routeId,
  stopId,
  lat,
  lng,
}: {
  tripId: string;
  routeId?: string;
  stopId?: string;
  lat: number;
  lng: number;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(PREFIX + tripId);
      const last = raw ? Number(raw) : 0;
      if (last && Date.now() - last < COOLDOWN_MS) setConfirmed(true);
    })();
  }, [tripId]);

  const onConfirm = useCallback(async () => {
    if (submitting || confirmed) return;
    setSubmitting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const deviceId = await getOrCreateDeviceId();
      await fetch(`${API_BASE}/api/public/sighting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, tripId, routeId, stopId, lat, lng }),
      });
      await AsyncStorage.setItem(PREFIX + tripId, String(Date.now()));
      setConfirmed(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // Silent — the server rate-limits duplicates and the rider can retap.
    } finally {
      setSubmitting(false);
    }
  }, [confirmed, submitting, tripId, routeId, stopId, lat, lng]);

  if (confirmed) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          borderRadius: 20,
          backgroundColor: "rgba(63,155,178,0.10)",
          borderWidth: 1,
          borderColor: "rgba(63,155,178,0.30)",
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View
          style={{
            marginTop: 6,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: palette.aegeanDeep,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ ...KICKER, color: palette.aegeanDeep }}>Thanks — logged</Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "Geist_500Medium",
              fontSize: 13,
              lineHeight: 18,
              color: palette.inkSoft,
            }}
          >
            Other riders will see this bus is really there.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onConfirm}
      disabled={submitting}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: 20,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: pressed ? palette.aegeanDeep : palette.line,
        paddingHorizontal: 16,
        paddingVertical: 14,
        opacity: submitting ? 0.6 : 1,
      })}
    >
      <View
        style={{
          marginTop: 6,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: palette.ochre,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ ...KICKER, color: palette.inkSoft }}>You see the bus?</Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 16,
            lineHeight: 20,
            color: palette.ink,
          }}
        >
          {submitting ? "Sending…" : "I see this bus"}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: "Geist_500Medium",
            fontSize: 12,
            lineHeight: 17,
            color: palette.inkSoft,
          }}
        >
          One tap tells every other rider the bus is really here.
        </Text>
      </View>
      {submitting ? (
        <ActivityIndicator size="small" color={palette.aegeanDeep} />
      ) : null}
    </Pressable>
  );
}
