// Native multi-leg trip companion. Native mirror of
// `src/components/MultiLegCompanion.tsx` — leg ribbon, phase hero, dual-
// vehicle map, per-phase action HUD, walk turn-by-turn, and a leg
// timeline with the current one highlighted.
//
// Focused on the flight-in-progress experience. Server-side extras from
// the web version (disruption watcher, shortcut prompt, last-mile chain,
// live re-plan sheet, wrong-stop hint) are intentionally deferred to keep
// parity with the mobile single-leg companion — they hop through server
// fns that we haven't wired for the RN client yet.

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { palette } from "@/constants/theme";
import {
  MapView,
  type MapMarker,
  type VehicleOverride,
} from "@/components/MapView";
import { RouteChip } from "@/components/RouteChip";
import { WalkGuidance } from "@/components/WalkGuidance";
import {
  clearActiveTrip,
  type ActiveTrip,
} from "@/lib/trip-store";
import {
  multiLegConfirmOnBoard,
  multiLegMarkAlighted,
  multiLegMarkArrived,
  multiLegMarkMissed,
  useMultiLegJourney,
  type MultiLegLive,
} from "@/lib/useMultiLegJourney";
import { useDisruptionWatch } from "@/lib/useDisruptionWatch";
import { DisruptionBanner } from "@/components/DisruptionBanner";
import { fetchWalkingDirections } from "@/lib/walk";
import { distanceM } from "@aloya/core/geo";
import type {
  Itinerary,
  Leg,
  RideLeg,
  WalkLeg,
  WaitLeg,
} from "@/lib/journey-types";

const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

function fmtMin(sec: number): number {
  return Math.max(0, Math.round(sec / 60));
}

function fmtClock(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export function MultiLegCompanion({ active }: { active: ActiveTrip }) {
  const insets = useSafeAreaInsets();
  const itin = active.itinerary!;
  const live = useMultiLegJourney(active);
  const disruption = useDisruptionWatch(active, live);

  // ---- Walk directions for the current walk leg (lazy per-leg) -----------
  const currentWalk =
    live.currentLeg?.kind === "walk" ? live.currentLeg : null;
  const walkQuery = useQuery({
    queryKey: currentWalk
      ? [
          "mlWalk",
          currentWalk.from.lat,
          currentWalk.from.lng,
          currentWalk.to.lat,
          currentWalk.to.lng,
        ]
      : ["mlWalk", "none"],
    queryFn: async () => {
      if (!currentWalk) return null;
      const r = await fetchWalkingDirections({
        from: { lat: currentWalk.from.lat, lng: currentWalk.from.lng },
        to: { lat: currentWalk.to.lat, lng: currentWalk.to.lng },
      });
      return r.directions;
    },
    enabled: !!currentWalk,
    staleTime: 30 * 60_000,
  });
  const directions = walkQuery.data ?? null;

  // ---- Map: dual-vehicle fusion + full-itinerary markers ------------------
  const bounds = useMemo(() => boundsFor(itin), [itin]);
  const restrictTripIds = useMemo(() => {
    const ids: string[] = [];
    if (live.currentRideLeg) ids.push(live.currentRideLeg.tripId);
    if (
      live.nextRideLeg &&
      (live.phase === "walking-to-transfer" ||
        live.phase === "waiting-for-connection" ||
        live.phase === "missed-connection")
    ) {
      ids.push(live.nextRideLeg.tripId);
    }
    return ids.length ? ids : undefined;
  }, [live.currentRideLeg, live.nextRideLeg, live.phase]);
  const mapMarkers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [
      {
        lat: active.from.lat,
        lng: active.from.lng,
        kind: "origin",
        label: active.from.label,
      },
      {
        lat: active.to.lat,
        lng: active.to.lng,
        kind: "destination",
        label: active.to.label,
      },
    ];
    for (const leg of itin.legs) {
      if (leg.kind === "ride") {
        out.push({
          lat: leg.board.lat,
          lng: leg.board.lng,
          kind: "stop",
          tone: "aegean",
          label: leg.board.name,
        });
        out.push({
          lat: leg.alight.lat,
          lng: leg.alight.lng,
          kind: "stop",
          tone: "ochre",
          label: leg.alight.name,
        });
      }
    }
    return out;
  }, [itin, active.from, active.to]);
  const vehicleOverrides = useMemo<
    Record<string, VehicleOverride> | undefined
  >(() => {
    if (!live.fusedCurrentVehicle) return undefined;
    return {
      [live.fusedCurrentVehicle.tripId]: {
        lat: live.fusedCurrentVehicle.lat,
        lng: live.fusedCurrentVehicle.lng,
        bearing: live.fusedCurrentVehicle.bearing,
        source: live.vehicleLost ? "rider" : "feed",
      },
    };
  }, [live.fusedCurrentVehicle, live.vehicleLost]);
  const userLocation = live.fix
    ? { lat: live.fix.lat, lng: live.fix.lng }
    : null;

  // Haptic on phase change into alert-worthy states.
  useEffect(() => {
    if (live.phase === "alight-soon") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (live.phase === "arrived") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (live.phase === "missed-connection") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [live.phase]);

  // "I'm off" — snap to alighted; wrong-stop shortcut deferred.
  const handleImOff = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    multiLegMarkAlighted();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Top bar */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={() => router.back()}
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
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 18,
              color: palette.ink,
            }}
          >
            ←
          </Text>
        </Pressable>
        <Text style={{ ...KICKER, color: palette.inkSoft }}>
          {itin.transfers === 1 ? "1 change" : `${itin.transfers} changes`} ·
          ride {Math.max(1, live.rideOrdinal)}/{live.totalRides}
        </Text>
        <Pressable
          onPress={() => {
            clearActiveTrip();
            router.replace("/(tabs)/plan");
          }}
          style={({ pressed }) => ({
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
              letterSpacing: -0.2,
            }}
          >
            End trip
          </Text>
        </Pressable>
      </View>

      {/* Leg ribbon — condensed timeline chip strip */}
      <LegRibbon itin={itin} live={live} />

      {/* Hero */}
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <View
          style={{
            borderRadius: 32,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 24,
          }}
        >
          <PhaseLabel live={live} itin={itin} />
          <PhaseHeadline live={live} itin={itin} />
          <PhaseSub live={live} itin={itin} destLabel={active.to.label} />
        </View>
      </View>

      {/* Honest banners */}
      {live.active && live.tripGhost && !live.vehicleLost && (
        <BannerCard
          tone="ochre"
          title="Ghost bus"
          body="This trip is on the schedule but the operator hasn't reported it yet. Countdowns are on schedule until GPS appears."
        />
      )}
      {live.active && live.vehicleLost && (
        <BannerCard
          tone="aegean"
          title="Tracking from your phone"
          body="We lost the operator vehicle. Using your GPS as the bus until it comes back."
        />
      )}
      {live.active &&
        !live.vehicleLost &&
        !live.tripGhost &&
        live.feedStale && (
          <BannerCard
            tone="ochre"
            title="Feed is stale"
            body="The live feed hasn't refreshed recently. Countdowns are on schedule until it recovers."
          />
        )}
      {live.active &&
        (live.phase === "walking-to-transfer" ||
          live.phase === "waiting-for-connection") &&
        live.nextRideLeg &&
        !live.nextVehicleTracked && (
          <BannerCard
            tone="ink"
            title="Connecting bus not tracked yet"
            body={`No GPS from bus ${live.nextRideLeg.routeShort} for this run. We're going on schedule for now.`}
          />
        )}

      {/* Live map */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <MapView
          height={230}
          spanKm={bounds.spanKm}
          center={bounds.center}
          markers={mapMarkers}
          liveVehicles
          restrictTripIds={restrictTripIds}
          vehicleOverrides={vehicleOverrides}
          userLocation={userLocation}
          fitToContent
        />
      </View>

      {/* Action HUD */}
      <View style={{ marginTop: 22 }}>
        <MultiLegActions live={live} active={active} onImOff={handleImOff} />
      </View>

      {/* Walk turn-by-turn for the current walk leg */}
      {currentWalk && directions && directions.steps.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <WalkGuidance
            title={
              live.phase === "walking-to-board"
                ? `Walk to ${currentWalk.to.name}`
                : live.phase === "walking-to-transfer"
                  ? `Walk to bus ${live.nextRideLeg?.routeShort ?? ""}`
                  : `Walk to ${currentWalk.to.name}`
            }
            steps={directions.steps}
            totalDurationSec={directions.durationSec}
            totalDistanceMeters={directions.distanceMeters}
          />
        </View>
      )}

      {/* Full timeline */}
      <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 22,
              lineHeight: 24,
              letterSpacing: -0.4,
              color: palette.ink,
            }}
          >
            Your journey
          </Text>
          <Text style={{ ...KICKER, color: palette.inkSoft, paddingBottom: 3 }}>
            {Math.round(itin.totalDurationSec / 60)} min · arr{" "}
            {fmtClock(itin.arrivalUnix)}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 28,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 20,
            gap: 18,
          }}
        >
          {itin.legs.map((leg, i) => (
            <LegTimelineRow
              key={i}
              leg={leg}
              isActive={i === live.currentLegIndex}
              isDone={i < live.currentLegIndex || live.phase === "arrived"}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Leg ribbon
// ---------------------------------------------------------------------------
function LegRibbon({
  itin,
  live,
}: {
  itin: Itinerary;
  live: MultiLegLive;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 20,
        gap: 8,
        flexDirection: "row",
      }}
    >
      {itin.legs.map((leg, i) => {
        const isActive = i === live.currentLegIndex;
        const isDone =
          i < live.currentLegIndex || live.phase === "arrived";
        const bg = isActive
          ? palette.ink
          : isDone
            ? palette.oliveSoft
            : palette.white;
        const fg = isActive
          ? palette.limestone
          : isDone
            ? palette.white
            : palette.ink;
        const label =
          leg.kind === "ride"
            ? leg.routeShort
            : leg.kind === "walk"
              ? "Walk"
              : "Wait";
        return (
          <View
            key={i}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor: isActive ? palette.ink : palette.line,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                color: fg,
                opacity: 0.7,
              }}
            >
              {i + 1}
            </Text>
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 12,
                color: fg,
                letterSpacing: -0.2,
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Hero copy
// ---------------------------------------------------------------------------
function PhaseLabel({
  live,
  itin,
}: {
  live: MultiLegLive;
  itin: Itinerary;
}) {
  const tone =
    live.phase === "arrived"
      ? palette.olive
      : live.phase === "alight-soon" || live.nextBoardLate
        ? palette.ochre
        : live.phase === "missed-connection"
          ? palette.ochre
          : palette.aegeanDeep;
  const text =
    live.phase === "idle"
      ? "Ready when you are"
      : live.phase === "walking-to-board"
        ? "Walking to first bus"
        : live.phase === "waiting-to-board"
          ? `Waiting for bus ${live.currentRideLeg?.routeShort ?? ""}`
          : live.phase === "riding"
            ? `On bus ${live.currentRideLeg?.routeShort ?? ""} · ${live.rideOrdinal}/${live.totalRides}`
            : live.phase === "alight-soon"
              ? "Alight next"
              : live.phase === "walking-to-transfer"
                ? `Walk to bus ${live.nextRideLeg?.routeShort ?? ""}`
                : live.phase === "waiting-for-connection"
                  ? `Waiting for bus ${live.nextRideLeg?.routeShort ?? ""}`
                  : live.phase === "missed-connection"
                    ? "Missed connection"
                    : live.phase === "walking-to-destination"
                      ? "Final stretch"
                      : "Arrived";
  const detail =
    live.phase === "waiting-for-connection" && live.nextRideLeg
      ? live.nextBoardLate
        ? "running late"
        : live.nextBoardSource === "live"
          ? "live"
          : "scheduled"
      : itin.source === "live"
        ? "live"
        : itin.source === "mixed"
          ? "live + scheduled"
          : "scheduled";
  return (
    <Text style={{ ...KICKER, color: tone }}>
      {text} <Text style={{ color: palette.inkSoft }}>— {detail}</Text>
    </Text>
  );
}

function PhaseHeadline({
  live,
  itin,
}: {
  live: MultiLegLive;
  itin: Itinerary;
}) {
  const base = {
    marginTop: 10,
    fontFamily: "BricolageGrotesque_800ExtraBold" as const,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: palette.ink,
  };
  const italic = {
    fontFamily: "BricolageGrotesque_400Regular_Italic" as const,
    color: palette.oliveSoft,
  };
  if (live.phase === "walking-to-board" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Walk to{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {live.currentRideLeg.board.name}
        </Text>
        {"\n"}
        <Text style={italic}>
          Bus {live.currentRideLeg.routeShort} in{" "}
          {fmtMin(live.secsToCurrentBoard)} min
        </Text>
      </Text>
    );
  }
  if (live.phase === "waiting-to-board" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Bus {live.currentRideLeg.routeShort} in{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {fmtMin(live.secsToCurrentBoard)}
        </Text>{" "}
        min
        {"\n"}
        <Text style={italic}>at {live.currentRideLeg.board.name}</Text>
      </Text>
    );
  }
  if (live.phase === "riding" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Off in{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {fmtMin(live.secsToCurrentAlight)}
        </Text>{" "}
        min
        {"\n"}
        <Text style={italic}>
          at {live.currentRideLeg.alight.name}
          {live.nextRideLeg
            ? ` — then change to ${live.nextRideLeg.routeShort}`
            : "."}
        </Text>
      </Text>
    );
  }
  if (live.phase === "alight-soon" && live.currentRideLeg) {
    return (
      <Text style={base}>
        Step off <Text style={{ color: palette.ochre }}>next</Text>
        {"\n"}
        <Text style={italic}>{live.currentRideLeg.alight.name}.</Text>
      </Text>
    );
  }
  if (
    live.phase === "walking-to-transfer" &&
    live.nextRideLeg &&
    live.currentLeg?.kind === "walk"
  ) {
    return (
      <Text style={base}>
        Walk to{" "}
        <Text style={{ color: palette.aegeanDeep }}>
          {live.nextRideLeg.board.name}
        </Text>
        {"\n"}
        <Text style={italic}>
          {fmtMin(live.currentLeg.durationSec)} min for bus{" "}
          {live.nextRideLeg.routeShort}
        </Text>
      </Text>
    );
  }
  if (live.phase === "waiting-for-connection" && live.nextRideLeg) {
    return (
      <Text style={base}>
        Bus {live.nextRideLeg.routeShort} in{" "}
        <Text
          style={{
            color: live.nextBoardLate ? palette.ochre : palette.aegeanDeep,
          }}
        >
          {fmtMin(live.secsToNextBoard)}
        </Text>{" "}
        min
        {"\n"}
        <Text style={italic}>at {live.nextRideLeg.board.name}</Text>
      </Text>
    );
  }
  if (live.phase === "missed-connection" && live.nextRideLeg) {
    return (
      <Text style={base}>
        Missed bus{" "}
        <Text style={{ color: palette.ochre }}>
          {live.nextRideLeg.routeShort}
        </Text>
        {"\n"}
        <Text style={italic}>We can find you a new way from here.</Text>
      </Text>
    );
  }
  if (live.phase === "walking-to-destination") {
    return (
      <Text style={base}>
        Final stretch
        {"\n"}
        <Text style={italic}>
          {fmtMin(
            live.currentLeg?.kind === "walk"
              ? live.currentLeg.durationSec
              : 0,
          )}{" "}
          min on foot
        </Text>
      </Text>
    );
  }
  if (live.phase === "arrived") {
    return (
      <Text style={base}>
        You're <Text style={{ color: palette.olive }}>there</Text>
        {"\n"}
        <Text style={italic}>Welcome. Have a great one.</Text>
      </Text>
    );
  }
  const firstRide = itin.legs.find((l): l is RideLeg => l.kind === "ride");
  return (
    <Text style={base}>
      Door to door{" "}
      <Text style={{ color: palette.aegeanDeep }}>
        {Math.round(itin.totalDurationSec / 60)}
      </Text>{" "}
      min
      {"\n"}
      <Text style={italic}>
        Starting on bus {firstRide?.routeShort ?? ""}
      </Text>
    </Text>
  );
}

function PhaseSub({
  live,
  itin,
  destLabel,
}: {
  live: MultiLegLive;
  itin: Itinerary;
  destLabel: string;
}) {
  const changesLabel =
    itin.transfers === 1 ? "1 change" : `${itin.transfers} changes`;
  const text =
    live.phase === "idle"
      ? `${changesLabel} · we'll keep you on time.`
      : live.phase === "walking-to-board"
        ? "Head to your first stop. We'll flip the moment you're there."
        : live.phase === "waiting-to-board"
          ? "We'll ping you the moment to board."
          : live.phase === "riding"
            ? live.nextRideLeg
              ? `Change to bus ${live.nextRideLeg.routeShort} at ${live.currentRideLeg?.alight.name ?? ""}.`
              : "Sit tight. We'll press stop for you."
            : live.phase === "alight-soon"
              ? live.nextRideLeg
                ? `Then walk to ${live.nextRideLeg.board.name} for bus ${live.nextRideLeg.routeShort}.`
                : `Then a short walk to ${destLabel}.`
              : live.phase === "walking-to-transfer"
                ? live.nextRideLeg
                  ? `Bus ${live.nextRideLeg.routeShort} in ${fmtMin(live.secsToNextBoard)} min at the transfer stop.`
                  : "Head to your next stop."
                : live.phase === "waiting-for-connection"
                  ? live.nextBoardLate
                    ? "The connecting bus is running late. We'll keep updating."
                    : "We're watching this stop for you."
                  : live.phase === "missed-connection"
                    ? "We'll plan the next best route from here."
                    : live.phase === "walking-to-destination"
                      ? `About ${fmtMin(live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0)} min to ${destLabel}.`
                      : `Welcome to ${destLabel}.`;
  return (
    <Text
      style={{
        marginTop: 16,
        fontFamily: "Geist_500Medium",
        fontSize: 13,
        lineHeight: 20,
        color: palette.inkSoft,
      }}
    >
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Action HUD
// ---------------------------------------------------------------------------
function MultiLegActions({
  live,
  active,
  onImOff,
}: {
  live: MultiLegLive;
  active: ActiveTrip;
  onImOff: () => void;
}) {
  if (!live.active) {
    return (
      <ActionCard
        tone="aegean"
        kicker="Live guidance"
        title={`Ready to head to ${active.to.label}?`}
        body="We'll follow every leg, hurry you when needed, and tell you exactly when to press stop."
        cta="Tap when you leave"
        onPress={() => {
          // Live tracking starts when the trip is started elsewhere;
          // no-op fallback keeps this action idempotent.
        }}
      />
    );
  }

  if (live.phase === "waiting-to-board") {
    return (
      <ActionCard
        tone="ink"
        kicker={`On bus ${live.currentRideLeg?.routeShort ?? ""}?`}
        title="Confirm when you've boarded"
        body={`We'll then guide you to ${live.currentRideLeg?.alight.name ?? "your stop"}.`}
        cta="I'm on board"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          multiLegConfirmOnBoard();
        }}
      />
    );
  }

  if (live.phase === "alight-soon") {
    return (
      <ActionCard
        tone="ochre"
        kicker="Press stop now"
        title={live.currentRideLeg?.alight.name ?? "Your stop is next"}
        body="Reach for the stop button. Tap once you're off."
        cta="I'm off"
        onPress={onImOff}
      />
    );
  }

  if (live.phase === "walking-to-destination") {
    const walkMin = fmtMin(
      live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0,
    );
    return (
      <ActionCard
        tone="olive"
        kicker={`Final walk · ${walkMin} min`}
        title={`To ${active.to.label}`}
        body="We'll flip to arrived automatically. Tap if you're already there."
        cta="I'm here"
        onPress={() => {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
          multiLegMarkArrived();
        }}
      />
    );
  }

  if (live.phase === "missed-connection") {
    return (
      <ActionCard
        tone="ochre"
        kicker="Missed connection"
        title={`Bus ${live.nextRideLeg?.routeShort ?? ""} left without you`}
        body="Mark it and we'll help you replan from where you are."
        cta="Mark missed"
        onPress={() => {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          multiLegMarkMissed();
        }}
      />
    );
  }

  if (live.phase === "arrived") {
    return (
      <ActionCard
        tone="olive"
        kicker="Arrived"
        title={`Welcome to ${active.to.label}`}
        body="Trip complete. We'll remember this route next time."
        cta="Close"
        onPress={() => {
          clearActiveTrip();
          router.replace("/(tabs)/plan");
        }}
      />
    );
  }

  // Calm tracking pill for phases with no explicit action.
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderRadius: 999,
          backgroundColor: palette.white,
          borderWidth: 1,
          borderColor: palette.line,
          paddingHorizontal: 18,
          paddingVertical: 12,
        }}
      >
        <ActivityIndicator size="small" color={palette.aegeanDeep} />
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            color: palette.inkSoft,
          }}
        >
          Tracking your journey.
        </Text>
      </View>
    </View>
  );
}

function ActionCard({
  tone,
  kicker,
  title,
  body,
  cta,
  onPress,
}: {
  tone: "aegean" | "ochre" | "olive" | "ink";
  kicker: string;
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}) {
  const bg =
    tone === "aegean"
      ? palette.aegeanSoft
      : tone === "ochre"
        ? palette.ochreSoft
        : tone === "olive"
          ? "rgba(63,74,54,0.10)"
          : palette.white;
  const border =
    tone === "aegean"
      ? "rgba(63,155,178,0.30)"
      : tone === "ochre"
        ? "rgba(201,133,58,0.40)"
        : tone === "olive"
          ? "rgba(63,74,54,0.25)"
          : palette.line;
  const kickerColor =
    tone === "aegean"
      ? palette.aegeanDeep
      : tone === "ochre"
        ? palette.ochre
        : tone === "olive"
          ? palette.olive
          : palette.aegeanDeep;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 28,
          padding: 22,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
        }}
      >
        <Text style={{ ...KICKER, color: kickerColor }}>{kicker}</Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 24,
            lineHeight: 28,
            letterSpacing: -0.4,
            color: palette.ink,
          }}
        >
          {title}
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
          {body}
        </Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            marginTop: 16,
            alignSelf: "flex-start",
            backgroundColor: palette.ink,
            paddingHorizontal: 22,
            paddingVertical: 13,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 13,
              color: palette.limestone,
              letterSpacing: -0.2,
            }}
          >
            {cta}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timeline row
// ---------------------------------------------------------------------------
function LegTimelineRow({
  leg,
  isActive,
  isDone,
}: {
  leg: Leg;
  isActive: boolean;
  isDone: boolean;
}) {
  const dotBg = isDone
    ? "rgba(63,74,54,0.10)"
    : isActive
      ? palette.aegeanDeep
      : palette.limestoneSoft;
  const dotColor = isDone
    ? palette.olive
    : isActive
      ? palette.white
      : palette.inkSoft;
  const glyph =
    leg.kind === "ride" ? "◇" : leg.kind === "walk" ? "→" : "…";
  let title: React.ReactNode;
  let sub: string;
  let accent: React.ReactNode = null;
  if (leg.kind === "ride") {
    title = (
      <Text>
        Board{" "}
        <Text style={{ color: palette.aegeanDeep }}>bus {leg.routeShort}</Text>{" "}
        — {leg.routeLong}
      </Text>
    );
    sub = `${leg.board.name} → ${leg.alight.name} · ${fmtClock(leg.board.departureUnix)}–${fmtClock(leg.alight.arrivalUnix)} · ${leg.stopCount} stops`;
    accent = <RouteChip short={leg.routeShort} />;
  } else if (leg.kind === "walk") {
    const w = leg as WalkLeg;
    title = <Text>Walk to {w.to.name}</Text>;
    sub = `${fmtMin(w.durationSec)} min · ${Math.round(w.distanceMeters)} m`;
  } else {
    const w = leg as WaitLeg;
    title = <Text>Wait at {w.name}</Text>;
    sub = `${fmtMin(w.durationSec)} min for the next bus`;
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: dotBg,
          borderWidth: 1,
          borderColor: isActive ? palette.aegeanDeep : palette.line,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 13,
            color: dotColor,
          }}
        >
          {glyph}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 17,
            lineHeight: 21,
            letterSpacing: -0.3,
            color: isActive ? palette.ink : palette.inkSoft,
          }}
        >
          {title}
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
          {sub}
        </Text>
      </View>
      {accent}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function BannerCard({
  tone,
  title,
  body,
}: {
  tone: "aegean" | "ochre" | "ink";
  title: string;
  body: string;
}) {
  const bg =
    tone === "aegean"
      ? palette.aegeanSoft
      : tone === "ochre"
        ? palette.ochreSoft
        : palette.white;
  const border =
    tone === "aegean"
      ? "rgba(63,155,178,0.30)"
      : tone === "ochre"
        ? "rgba(201,133,58,0.40)"
        : palette.line;
  const kickerColor =
    tone === "aegean"
      ? palette.aegeanDeep
      : tone === "ochre"
        ? palette.ochre
        : palette.ink;
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
      <View
        style={{
          borderRadius: 22,
          padding: 16,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
        }}
      >
        <Text style={{ ...KICKER, color: kickerColor }}>{title}</Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            lineHeight: 19,
            color: palette.ink,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function boundsFor(it: Itinerary): {
  center: { lat: number; lng: number };
  spanKm: number;
} {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const leg of it.legs) {
    const pts: Array<{ lat: number; lng: number }> =
      leg.kind === "ride"
        ? [
            { lat: leg.board.lat, lng: leg.board.lng },
            { lat: leg.alight.lat, lng: leg.alight.lng },
          ]
        : leg.kind === "walk"
          ? [
              { lat: leg.from.lat, lng: leg.from.lng },
              { lat: leg.to.lat, lng: leg.to.lng },
            ]
          : [{ lat: leg.lat, lng: leg.lng }];
    for (const p of pts) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
  }
  if (!isFinite(minLat)) {
    return { center: { lat: 35.17, lng: 33.36 }, spanKm: 4 };
  }
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const nw = { lat: maxLat, lng: minLng };
  const se = { lat: minLat, lng: maxLng };
  const diagM = distanceM(nw, se);
  const spanKm = Math.max(1, Math.min(60, (diagM / 1000) * 1.2));
  return { center, spanKm };
}
