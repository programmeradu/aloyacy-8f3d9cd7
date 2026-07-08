// Plan-your-way-there card: resume an active trip or plan a new one to the
// group destination.

import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette } from "@/constants/theme";
import { useActiveTrip } from "@/lib/trip-store";
import type { GroupRow } from "./kit";

export function PlanRouteCard({ group, joined }: { group: GroupRow; joined: boolean }) {
  const [busy, setBusy] = useState(false);
  const active = useActiveTrip();

  // ~500m of the group's meetup point counts as "already heading here".
  const activeMatches = useMemo(() => {
    if (!active) return false;
    const dLat = active.to.lat - group.destination_lat;
    const dLng = active.to.lng - group.destination_lng;
    const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111_000;
    return approxMeters < 500;
  }, [active, group.destination_lat, group.destination_lng]);

  const onPlan = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      let from: { lat: number; lng: number; label: string } | null = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        const canUse =
          perm.status === "granted" ||
          (perm.canAskAgain && (await Location.requestForegroundPermissionsAsync()).status === "granted");
        if (canUse) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          from = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Current location" };
        }
      } catch { /* fall through with no origin */ }

      await AsyncStorage.setItem(
        "aloya:nl-plan",
        JSON.stringify({
          from,
          to: {
            lat: group.destination_lat,
            lng: group.destination_lng,
            label: group.destination_label,
          },
          at: Date.now(),
        }),
      );
      router.push("/(tabs)/plan");
    } finally {
      setBusy(false);
    }
  }, [busy, group.destination_label, group.destination_lat, group.destination_lng]);

  if (active && activeMatches) {
    const busLeg = active.option.legs.find((l) => l.kind === "bus");
    const routeShort = busLeg && busLeg.kind === "bus" ? busLeg.routeShort : null;
    const arrivalUnix =
      active.itinerary?.arrivalUnix ??
      (active.option.legs[active.option.legs.length - 1] as { arrivalUnix?: number } | undefined)?.arrivalUnix;
    const minsAway = arrivalUnix
      ? Math.max(0, Math.round((arrivalUnix * 1000 - Date.now()) / 60_000))
      : null;
    return (
      <View
        style={{
          borderRadius: 24,
          backgroundColor: palette.limestoneSoft,
          borderWidth: 1,
          borderColor: palette.line,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: palette.aegeanDeep,
          }}
        >
          Trip in progress
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 20,
            lineHeight: 25,
            letterSpacing: -0.3,
            color: palette.ink,
          }}
        >
          {routeShort
            ? `You're on the ${routeShort} to ${group.destination_label}`
            : `You're on your way to ${group.destination_label}`}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.inkSoft,
          }}
        >
          {minsAway != null
            ? `Arriving in about ${minsAway} min. Open the live trip for turn-by-turn guidance — the group already sees your ETA.`
            : "Open the live trip for turn-by-turn guidance — the group already sees your ETA."}
        </Text>
        <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push(`/trip/${active.option.id}` as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Resume trip"
            style={{
              borderRadius: 14,
              backgroundColor: palette.aegeanDeep,
              paddingHorizontal: 20,
              paddingVertical: 14,
              minHeight: 48,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: palette.limestone,
              }}
            >
              Resume trip
            </Text>
          </Pressable>
          <Pressable
            onPress={onPlan}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Plan a different route"
            style={{
              borderRadius: 14,
              backgroundColor: "rgba(19,22,26,0.06)",
              paddingHorizontal: 16,
              paddingVertical: 14,
              minHeight: 48,
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: palette.ink,
              }}
            >
              {busy ? "Locating…" : "Plan a different route"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: palette.limestoneSoft,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 18,
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: palette.aegeanDeep,
        }}
      >
        {joined ? "Now get there" : "Plan your route"}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 20,
          lineHeight: 25,
          letterSpacing: -0.3,
          color: palette.ink,
        }}
      >
        {joined
          ? "Plan the bus that gets you to the meetup"
          : `Find the bus to ${group.destination_label}`}
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
        }}
      >
        {joined
          ? "The group can see your live ETA already. Open the planner to see which bus to catch, when it leaves, then start turn-by-turn guidance."
          : "Get door-to-door directions with live bus times. Once you start the trip, the group will see your real ETA update as you move."}
      </Text>
      <Pressable
        onPress={onPlan}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Plan my route to the meetup"
        style={{
          marginTop: 14,
          alignSelf: "flex-start",
          borderRadius: 14,
          backgroundColor: palette.aegeanDeep,
          paddingHorizontal: 20,
          paddingVertical: 14,
          minHeight: 48,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 12,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: palette.limestone,
          }}
        >
          {busy ? "Locating…" : "Plan my route"}
        </Text>
      </Pressable>
      <Text
        style={{
          marginTop: 12,
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 9,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          color: palette.inkSoft,
        }}
      >
        Live Cyprus bus schedules · come back to this page anytime
      </Text>
    </View>
  );
}

/* ——————————————————————————— How this works ——————————————————————————— */
