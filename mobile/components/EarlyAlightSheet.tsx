// Native EarlyAlight / LiveReplan sheet. Rider says "I'm off here" or
// the DisruptionBanner says "Find a faster route" — we reroute from
// their current GPS to the trip destination and let them pick a fresh
// itinerary. Selecting one swaps the active-trip in place, so the
// companion instantly reflects the new plan.
//
// Reuses the shared `/api/public/plan` endpoint (same planner the web
// EarlyAlightSheet's `rerouteFromHere` wraps) so we don't fork logic.

import { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { fetchPlan, type Itinerary as PlanItinerary } from "@/lib/plan";
import {
  setActiveTrip,
  initialLegState,
  type ActiveTrip,
} from "@/lib/trip-store";
import type {
  Itinerary,
  RideLeg,
  WalkLeg,
  JourneyOption,
} from "@/lib/journey-types";
import type { DisruptionKind } from "@/lib/useDisruptionWatch";

const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

const COPY: Record<
  DisruptionKind | "early-alight",
  { eyebrow: string; title: string; sub: string }
> = {
  "early-alight": {
    eyebrow: "Off the plan",
    title: "Find a new way from here",
    sub: "We'll reroute from your current position to your destination.",
  },
  "missed-connection": {
    eyebrow: "Missed connection",
    title: "Let's find a new way",
    sub: "Your connecting bus has left. Here are the next best options.",
  },
  "running-late": {
    eyebrow: "Running late",
    title: "Faster options from here",
    sub: "A different route may still get you there sooner.",
  },
  "connection-at-risk": {
    eyebrow: "Tight connection",
    title: "Backup routes",
    sub: "If you miss the transfer, one of these picks up from here.",
  },
  "vehicle-lost-feed": {
    eyebrow: "Live feed down",
    title: "Alternatives from here",
    sub: "In case the bus doesn't reappear, here are other options.",
  },
  "ghost-pre-board": {
    eyebrow: "No GPS from this bus",
    title: "Backup routes",
    sub: "The bus may still show up — but here are alternatives.",
  },
  "late-pre-board": {
    eyebrow: "Bus is late",
    title: "Faster options",
    sub: "The bus is slipping before you've even boarded.",
  },
};

function synthesizeOption(it: PlanItinerary, destLabel: string): JourneyOption {
  const firstRide = it.legs.find((l): l is RideLeg => l.kind === "ride");
  const walkIn = it.legs[0];
  const walkOut = it.legs[it.legs.length - 1];
  const legs: JourneyOption["legs"] = [];
  if (walkIn?.kind === "walk") {
    const w = walkIn as WalkLeg;
    legs.push({
      kind: "walk",
      from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
      to: { lat: w.to.lat, lng: w.to.lng, label: w.to.name },
      durationSec: w.durationSec,
      distanceMeters: w.distanceMeters,
    });
  }
  if (firstRide) {
    legs.push({
      kind: "bus",
      routeId: firstRide.routeId,
      routeShort: firstRide.routeShort,
      routeLong: firstRide.routeLong,
      tripId: firstRide.tripId,
      board: {
        stopId: firstRide.board.stopId,
        name: firstRide.board.name,
        departureUnix: firstRide.board.departureUnix,
      },
      alight: {
        stopId: firstRide.alight.stopId,
        name: firstRide.alight.name,
        arrivalUnix: firstRide.alight.arrivalUnix,
      },
      delaySec: firstRide.delaySec,
    });
  }
  if (walkOut && walkOut !== walkIn && walkOut.kind === "walk") {
    const w = walkOut as WalkLeg;
    legs.push({
      kind: "walk",
      from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
      to: { lat: w.to.lat, lng: w.to.lng, label: destLabel },
      durationSec: w.durationSec,
      distanceMeters: w.distanceMeters,
    });
  }
  return {
    id: it.id,
    totalDurationSec: it.totalDurationSec,
    departureUnix: it.departureUnix,
    arrivalUnix: it.arrivalUnix,
    legs,
    transfers: it.transfers,
  };
}

function fmtMin(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

export function EarlyAlightSheet({
  visible,
  active,
  fix,
  kind = "early-alight",
  onClose,
}: {
  visible: boolean;
  active: ActiveTrip;
  fix: { lat: number; lng: number } | null;
  kind?: DisruptionKind | "early-alight";
  onClose: () => void;
}) {
  const copy = COPY[kind];
  const enabled = !!fix && visible;
  const { data, isLoading } = useQuery({
    queryKey: [
      "mobile-replan",
      kind,
      fix?.lat.toFixed(4) ?? "",
      fix?.lng.toFixed(4) ?? "",
      active.to.lat,
      active.to.lng,
    ],
    queryFn: () =>
      fetchPlan({
        from: { lat: fix!.lat, lng: fix!.lng, label: "Here" },
        to: { lat: active.to.lat, lng: active.to.lng, label: active.to.label },
      }),
    enabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (visible) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [visible]);

  const options = (data?.itineraries ?? []).slice(0, 4);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(31,30,24,0.42)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: palette.limestone,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            borderWidth: 1,
            borderColor: palette.line,
            maxHeight: "88%",
            paddingBottom: 28,
          }}
        >
          {/* Header */}
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 22,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ ...KICKER, color: palette.aegeanDeep }}>{copy.eyebrow}</Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: "BricolageGrotesque_800ExtraBold",
                  fontSize: 26,
                  lineHeight: 30,
                  letterSpacing: -0.6,
                  color: palette.ink,
                }}
              >
                {copy.title}
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: "Geist_500Medium",
                  fontSize: 13,
                  lineHeight: 19,
                  color: palette.inkSoft,
                }}
              >
                {copy.sub}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: palette.white,
                borderWidth: 1,
                borderColor: palette.line,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Geist_700Bold", fontSize: 16, color: palette.ink }}>
                ×
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {!fix ? (
              <Text
                style={{
                  fontFamily: "Geist_500Medium",
                  fontSize: 13,
                  color: palette.inkSoft,
                  paddingVertical: 24,
                }}
              >
                Waiting for your location — this needs GPS to reroute.
              </Text>
            ) : isLoading ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <ActivityIndicator color={palette.aegeanDeep} />
                <Text
                  style={{
                    marginTop: 10,
                    fontFamily: "Geist_500Medium",
                    fontSize: 12,
                    color: palette.inkSoft,
                  }}
                >
                  Finding new options…
                </Text>
              </View>
            ) : options.length === 0 ? (
              <Text
                style={{
                  fontFamily: "Geist_500Medium",
                  fontSize: 13,
                  color: palette.inkSoft,
                  paddingVertical: 24,
                }}
              >
                Nothing better right now. Sit tight, or try again in a minute.
              </Text>
            ) : (
              <View style={{ gap: 12 }}>
                {options.map((it) => {
                  const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
                  const summary =
                    rides.length === 0
                      ? "Walk"
                      : rides.map((r) => `Bus ${r.routeShort}`).join(" → ");
                  const changesLabel =
                    it.transfers === 0
                      ? "No change"
                      : it.transfers === 1
                        ? "1 change"
                        : `${it.transfers} changes`;
                  return (
                    <Pressable
                      key={it.id}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        setActiveTrip({
                          ...active,
                          itinerary: it as unknown as Itinerary,
                          option: synthesizeOption(it, active.to.label),
                          legState: initialLegState(),
                        });
                        onClose();
                      }}
                      style={({ pressed }) => ({
                        borderRadius: 22,
                        backgroundColor: palette.white,
                        borderWidth: 1,
                        borderColor: pressed ? palette.aegeanDeep : palette.line,
                        padding: 18,
                      })}
                    >
                      <Text style={{ ...KICKER, color: palette.inkSoft }}>
                        {summary} · {changesLabel}
                      </Text>
                      <Text
                        style={{
                          marginTop: 6,
                          fontFamily: "BricolageGrotesque_700Bold",
                          fontSize: 19,
                          lineHeight: 23,
                          letterSpacing: -0.3,
                          color: palette.ink,
                        }}
                      >
                        {fmtMin(it.totalDurationSec)} to {active.to.label}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          fontFamily: "Geist_500Medium",
                          fontSize: 12,
                          color: palette.inkSoft,
                        }}
                      >
                        {Math.round(it.totalWalkMeters)} m walking · {it.source}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                marginTop: 20,
                borderRadius: 999,
                backgroundColor: palette.white,
                borderWidth: 1,
                borderColor: palette.line,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "Geist_600SemiBold",
                  fontSize: 13,
                  color: palette.inkSoft,
                }}
              >
                Keep current plan
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
