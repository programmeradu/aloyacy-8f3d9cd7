// Wave 1.3 · Sightings polish.
//
// "I see this bus" — rider-confirmed sighting CTA. Now shows the live
// trust-weighted rider count + confidence returned by the endpoint, and
// gives the rider a 15 s window to undo a mistap.

import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/push";

const COOLDOWN_MS = 60_000;
const UNDO_WINDOW_MS = 15_000;
const PREFIX = "aloya.sighting.";

const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

type Summary = { count: number; confidence: number; ageSec?: number };

function confidenceLabel(c: number) {
  if (c >= 0.75) return "High confidence";
  if (c >= 0.45) return "Building confidence";
  return "Early signal";
}

function toneForConfidence(c: number) {
  if (c >= 0.75) return palette.olive;
  if (c >= 0.45) return palette.aegeanDeep;
  return palette.ochre;
}

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
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(PREFIX + tripId);
      const last = raw ? Number(raw) : 0;
      if (last && Date.now() - last < COOLDOWN_MS) {
        setConfirmed(true);
        setConfirmedAt(last);
      }
    })();
  }, [tripId]);

  useEffect(() => {
    if (!confirmed) return;
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [confirmed]);

  const canUndo =
    confirmed && confirmedAt != null && now - confirmedAt < UNDO_WINDOW_MS;
  const undoSecondsLeft = canUndo
    ? Math.max(1, Math.ceil((UNDO_WINDOW_MS - (now - confirmedAt!)) / 1000))
    : 0;

  const onConfirm = useCallback(async () => {
    if (submitting || confirmed) return;
    setSubmitting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const deviceId = await getOrCreateDeviceId();
      const res = await fetch(`${API_BASE}/api/public/sighting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, tripId, routeId, stopId, lat, lng }),
      });
      const at = Date.now();
      await AsyncStorage.setItem(PREFIX + tripId, String(at));
      let s: Summary | null = null;
      try {
        const body = (await res.json()) as Summary;
        if (typeof body?.count === "number") s = body;
      } catch {}
      setSummary(s);
      setConfirmed(true);
      setConfirmedAt(at);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // Silent — server rate-limits duplicates and the rider can retap.
    } finally {
      setSubmitting(false);
    }
  }, [confirmed, submitting, tripId, routeId, stopId, lat, lng]);

  const onUndo = useCallback(async () => {
    if (!canUndo) return;
    void Haptics.selectionAsync().catch(() => {});
    try {
      const deviceId = await getOrCreateDeviceId();
      await fetch(`${API_BASE}/api/public/sighting`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, tripId }),
      });
    } catch {}
    await AsyncStorage.removeItem(PREFIX + tripId);
    setConfirmed(false);
    setConfirmedAt(null);
    setSummary(null);
  }, [canUndo, tripId]);

  if (confirmed) {
    const tone = summary ? toneForConfidence(summary.confidence) : palette.aegeanDeep;
    const label = summary ? confidenceLabel(summary.confidence) : "Thanks — logged";
    const ridersLine = summary
      ? summary.count <= 1
        ? "You're the first rider to confirm this bus."
        : `${summary.count} riders have confirmed this bus in the last 90s.`
      : "Other riders will see this bus is really there.";
    return (
      <View
        style={{
          borderRadius: 20,
          backgroundColor: "rgba(63,155,178,0.08)",
          borderWidth: 1,
          borderColor: "rgba(63,155,178,0.28)",
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View
            style={{
              marginTop: 6,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: tone,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ ...KICKER, color: tone }}>{label}</Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: "Geist_500Medium",
                fontSize: 13,
                lineHeight: 18,
                color: palette.inkSoft,
              }}
            >
              {ridersLine}
            </Text>
            {summary ? (
              <View
                style={{
                  marginTop: 10,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "rgba(31,30,24,0.08)",
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${Math.max(6, Math.round(summary.confidence * 100))}%`,
                    height: "100%",
                    backgroundColor: tone,
                  }}
                />
              </View>
            ) : null}
          </View>
        </View>
        {canUndo ? (
          <Pressable
            onPress={onUndo}
            style={({ pressed }) => ({
              marginTop: 12,
              alignSelf: "flex-start",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: pressed ? "rgba(31,30,24,0.08)" : "transparent",
              borderWidth: 1,
              borderColor: palette.line,
            })}
          >
            <Text
              style={{
                ...KICKER,
                color: palette.ink,
              }}
            >
              Undo ({undoSecondsLeft}s)
            </Text>
          </Pressable>
        ) : null}
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
