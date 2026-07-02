// Live Trip Companion — single-leg native screen. Mirror of the
// single-leg branch of `src/routes/trip.$id.tsx`.
//
// - Reads the active trip from AsyncStorage-backed `useActiveTrip`.
// - Falls back to a graceful "trip ended" state after end/expiry.
// - Multi-leg itineraries defer to Step 12c — for now we surface a clear
//   notice while still keeping single-leg trips fully functional.
// - Computes schedule-based phase + times, then overrides with the
//   GPS-truth phase from `useJourney` when live tracking is on.
// - Renders: header · phase hero · live map · honest feed banners ·
//   JourneyHUD · WalkGuidance · timeline · alight alert.

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { palette } from "@/constants/theme";
import { MapView, type MapMarker, type VehicleOverride } from "@/components/MapView";
import { ExpandableMap } from "@/components/ExpandableMap";
import { JourneyHUD } from "@/components/JourneyHUD";
import { WalkGuidance } from "@/components/WalkGuidance";
import { GroupTripButton } from "@/components/GroupTripButton";
import { RouteChip } from "@/components/RouteChip";
import { MultiLegCompanion } from "@/components/MultiLegCompanion";
import {
  useActiveTrip,
  clearActiveTrip,
  isMultiLeg,
} from "@/lib/trip-store";
import { useRealtime } from "@/lib/hooks";
import { fetchWalkingDirections } from "@/lib/walk";
import { useJourney, type LivePhase } from "@/lib/useJourney";
import { useTrafficWatch } from "@/lib/useTrafficWatch";

type Phase =
  | "leave-soon"
  | "walking"
  | "waiting"
  | "on-bus"
  | "alight-soon"
  | "arrived";

const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

export default function TripCompanionScreen() {
  const insets = useSafeAreaInsets();
  const active = useActiveTrip();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (active && isMultiLeg(active.itinerary)) {
    return <MultiLegCompanion active={active} />;
  }
  return (
    <SingleLegCompanion
      active={active}
      hydrated={hydrated}
      topInset={insets.top}
    />
  );
}

// ---------------------------------------------------------------------------
// Single-leg companion
// ---------------------------------------------------------------------------

function SingleLegCompanion({
  active,
  hydrated,
  topInset,
}: {
  active: ReturnType<typeof useActiveTrip>;
  hydrated: boolean;
  topInset: number;
}) {
  const rt = useRealtime();

  const view = useMemo(() => {
    if (!active) return null;
    const now = Math.floor(Date.now() / 1000);
    const bus = active.option.legs.find((l) => l.kind === "bus");
    const walkIn = active.option.legs[0];
    const walkOut = active.option.legs[active.option.legs.length - 1];
    if (!bus || bus.kind !== "bus") return null;
    if (walkIn.kind !== "walk" || walkOut.kind !== "walk") return null;

    const liveBoard = rt.data?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.board.stopId,
    );
    const liveAlight = rt.data?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.alight.stopId,
    );
    const boardUnix = liveBoard?.arrivalUnix ?? bus.board.departureUnix;
    const alightUnix = liveAlight?.arrivalUnix ?? bus.alight.arrivalUnix;
    const delaySec = liveBoard?.delaySec ?? bus.delaySec;
    const leaveByUnix = boardUnix - walkIn.durationSec;

    const startedAt = active.live?.startedAt
      ? Math.floor(active.live.startedAt / 1000)
      : null;
    const walkInSec = walkIn.durationSec;
    const onBoard = !!active.live?.onBoardConfirmedAt;
    const alighted = !!active.live?.alightedAt;

    const minToLeave = Math.round((leaveByUnix - now) / 60);
    const minToBoard = Math.round((boardUnix - now) / 60);
    const minToAlight = Math.round((alightUnix - now) / 60);
    const minToDoor = Math.round(
      (alightUnix + walkOut.durationSec - now) / 60,
    );

    let phase: Phase = "leave-soon";
    if (alighted) {
      phase = minToDoor > 0 ? "alight-soon" : "arrived";
    } else if (onBoard) {
      phase =
        minToAlight > 2
          ? "on-bus"
          : minToAlight > -1
            ? "alight-soon"
            : "arrived";
    } else if (startedAt != null) {
      const secsSinceStart = now - startedAt;
      phase = secsSinceStart < walkInSec - 30 ? "walking" : "waiting";
    } else {
      if (minToLeave > 1) phase = "leave-soon";
      else if (minToBoard > 1) phase = "walking";
      else if (now < boardUnix) phase = "waiting";
      else if (minToAlight > 2) phase = "on-bus";
      else if (minToAlight > -1) phase = "alight-soon";
      else phase = "arrived";
    }

    return {
      bus,
      walkIn,
      walkOut,
      delaySec,
      boardUnix,
      alightUnix,
      minToLeave,
      minToBoard,
      minToAlight,
      minToDoor,
      phase,
    };
  }, [active, rt.data]);

  const alightedAt = active?.live?.alightedAt ?? null;
  const walkingPhase: "to-stop" | "to-dest" | null = view
    ? alightedAt
      ? "to-dest"
      : view.phase === "leave-soon" ||
          view.phase === "walking" ||
          view.phase === "waiting"
        ? "to-stop"
        : view.phase === "arrived" || view.phase === "alight-soon"
          ? "to-dest"
          : null
    : null;
  const walkLeg = view
    ? walkingPhase === "to-stop"
      ? view.walkIn
      : walkingPhase === "to-dest"
        ? view.walkOut
        : null
    : null;
  const walkFrom = walkLeg && walkLeg.kind === "walk" ? walkLeg.from : null;
  const walkTo = walkLeg && walkLeg.kind === "walk" ? walkLeg.to : null;

  const dirQuery = useQuery({
    queryKey: ["walk", walkFrom?.lat, walkFrom?.lng, walkTo?.lat, walkTo?.lng],
    queryFn: () =>
      fetchWalkingDirections({
        from: { lat: walkFrom!.lat, lng: walkFrom!.lng },
        to: { lat: walkTo!.lat, lng: walkTo!.lng },
      }),
    enabled: !!walkFrom && !!walkTo,
    staleTime: 10 * 60 * 1000,
  });
  const directions = walkingPhase ? (dirQuery.data?.directions ?? null) : null;

  const live = useJourney({
    active: active ?? null,
    walkingSteps: directions?.steps ?? null,
    walkingPhase,
  });

  const mapMarkers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    if (!view || !active) return out;
    const { bus, walkIn, walkOut } = view;
    if (walkingPhase === "to-stop" && walkIn.kind === "walk") {
      out.push({
        lat: walkIn.from.lat,
        lng: walkIn.from.lng,
        kind: "origin",
        label: active.from.label,
      });
      out.push({
        lat: walkIn.to.lat,
        lng: walkIn.to.lng,
        kind: "stop",
        label: bus.board.name,
      });
    } else if (walkingPhase === "to-dest" && walkOut.kind === "walk") {
      out.push({
        lat: walkOut.from.lat,
        lng: walkOut.from.lng,
        kind: "stop",
        label: bus.alight.name,
      });
      out.push({
        lat: walkOut.to.lat,
        lng: walkOut.to.lng,
        kind: "destination",
        label: active.to.label,
      });
    } else {
      if (walkIn.kind === "walk")
        out.push({
          lat: walkIn.to.lat,
          lng: walkIn.to.lng,
          kind: "stop",
          label: bus.board.name,
        });
      if (walkOut.kind === "walk")
        out.push({
          lat: walkOut.from.lat,
          lng: walkOut.from.lng,
          kind: "destination",
          label: bus.alight.name,
        });
    }
    return out;
  }, [walkingPhase, active, view]);

  // Wave 3 · CyNAP incident overlay for the trip map — only the hits that
  // fall on this trip's corridor, mirroring the banner.
  const trafficAlert = useTrafficWatch(active);
  const trafficIncidents = useMemo(() => {
    if (!trafficAlert) return [];
    return trafficAlert.incidents
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => ({
        id: i.id,
        lat: i.lat as number,
        lng: i.lng as number,
        severity: i.severity,
        headline: i.headline,
        road: i.road,
        kind: i.kind,
      }));
  }, [trafficAlert]);


  // Early returns — after all hooks.
  if (!active && !hydrated) {
    return <View style={{ flex: 1, backgroundColor: palette.limestone }} />;
  }
  if (!active) {
    return <NoTripState topInset={topInset} />;
  }
  if (!view) return null;

  const { bus, walkIn, walkOut, delaySec, phase: schedulePhase } = view;
  let { minToBoard, minToAlight, minToDoor } = view;

  const liveToHero: Record<LivePhase, Phase> = {
    idle: schedulePhase,
    "walking-to-stop": "walking",
    "hurry-soft": "walking",
    "hurry-urgent": "walking",
    "at-stop": "waiting",
    boarding: "waiting",
    "missed-bus": "walking",
    "on-bus": "on-bus",
    "alight-soon": "alight-soon",
    "walking-to-dest": "arrived",
    arrived: "arrived",
  };
  const phase: Phase =
    live.active && live.phase !== "idle"
      ? (liveToHero[live.phase] ?? schedulePhase)
      : schedulePhase;

  if (
    live.active &&
    live.secsToBoard > 0 &&
    (phase === "walking" || phase === "waiting")
  ) {
    minToBoard = Math.max(0, Math.round(live.secsToBoard / 60));
  }
  if (
    live.active &&
    live.fusedSecsToAlight > 0 &&
    (phase === "on-bus" || phase === "alight-soon")
  ) {
    minToAlight = Math.round(live.fusedSecsToAlight / 60);
    const walkOutSec = walkOut.kind === "walk" ? walkOut.durationSec : 0;
    minToDoor = Math.round((live.fusedSecsToAlight + walkOutSec) / 60);
  }

  const vehicleOverrides: Record<string, VehicleOverride> | undefined =
    live.fusedVehicle
      ? {
          [live.fusedVehicle.tripId]: {
            lat: live.fusedVehicle.lat,
            lng: live.fusedVehicle.lng,
            bearing: live.fusedVehicle.bearing,
            routeId: bus.routeId,
            label: `Bus ${bus.routeShort}`,
            source: live.vehicleLost ? "synthetic" : "feed+rider",
          },
        }
      : undefined;

  const userLocation = live.fix
    ? { lat: live.fix.lat, lng: live.fix.lng }
    : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: topInset + 12,
        paddingBottom: 72,
      }}
      refreshControl={
        <RefreshControl
          refreshing={rt.isFetching && !rt.isLoading}
          onRefresh={() => {
            rt.refetch();
            dirQuery.refetch();
          }}
          tintColor={palette.aegeanDeep}
        />
      }
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/plan"))}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 16,
              color: palette.ink,
              marginTop: -2,
            }}
          >
            ←
          </Text>
        </Pressable>
        <Text style={{ ...KICKER, color: palette.aegeanDeep }}>Live trip</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            clearActiveTrip();
            router.replace("/(tabs)/plan");
          }}
          style={({ pressed }) => ({
            backgroundColor: palette.ink,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 12,
              color: palette.limestone,
              letterSpacing: -0.2,
            }}
          >
            End trip
          </Text>
        </Pressable>
      </View>

      {/* Hero */}
      <View style={{ paddingHorizontal: 20 }}>
        <View
          style={{
            borderRadius: 32,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.line,
            padding: 24,
          }}
        >
          <PhaseLabel phase={phase} delaySec={delaySec} />
          <PhaseHeadline
            phase={phase}
            minToLeave={view.minToLeave}
            minToBoard={minToBoard}
            minToAlight={minToAlight}
            minToDoor={minToDoor}
            boardName={bus.board.name}
            alightName={bus.alight.name}
          />
          <PhaseSub
            phase={phase}
            walkInSec={walkIn.kind === "walk" ? walkIn.durationSec : 0}
            walkOutSec={walkOut.kind === "walk" ? walkOut.durationSec : 0}
            destName={active.to.label}
            boardName={bus.board.name}
            alightName={bus.alight.name}
            minToDoor={minToDoor}
          />
          <View
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTopWidth: 1,
              borderTopColor: palette.line,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <RouteChip short={bus.routeShort} />
            <Text
              style={{
                flex: 1,
                fontFamily: "Geist_600SemiBold",
                fontSize: 13,
                color: palette.ink,
              }}
              numberOfLines={2}
            >
              {bus.routeLong}
            </Text>
          </View>
        </View>
      </View>

      {/* Watch together — prominent below the hero so friends can be
          invited before the trip really begins. Returning to this page
          also brings the rider back to their group. */}
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <GroupTripButton
          active={active}
          fix={live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null}
          etaMinutes={minToDoor}
        />
      </View>

      {/* Live map */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <ExpandableMap
          height={220}
          spanKm={1.5}
          center={{
            lat: (active.from.lat + active.to.lat) / 2,
            lng: (active.from.lng + active.to.lng) / 2,
          }}
          polyline={directions?.polyline}
          markers={mapMarkers}
          focusTripId={bus.tripId}
          focusRouteId={bus.routeId}
          vehicleOverrides={vehicleOverrides}
          userLocation={userLocation}
          trafficIncidents={trafficIncidents}
          fitToContent
        />
      </View>

      {/* Honest feed banners */}
      {live.active && live.tripGhost && !live.vehicleLost && (
        <BannerCard tone="ochre" title="Ghost bus" body="This trip is on the schedule but the operator hasn't reported it yet. We'll show it the moment a vehicle appears." />
      )}
      {live.active && !live.tripGhost && live.feedStale && (
        <BannerCard tone="ochre" title="Feed is stale" body="The live feed hasn't refreshed recently. Countdowns are on schedule until it recovers." />
      )}
      {live.active && !live.feedStale && !live.tripGhost && live.vehicleLost && (
        <BannerCard tone="aegean" title="Tracking from your phone" body="We lost the operator vehicle. Using your GPS as the bus until it comes back." />
      )}
      {live.active &&
        !live.feedStale &&
        !live.vehicleLost &&
        !live.tripGhost &&
        live.vehicleNotTracked && (
          <BannerCard tone="ink" title="This run isn't tracked yet" body="No GPS from the vehicle for this trip. We're going on schedule for now." />
        )}

      {/* JourneyHUD */}
      <View style={{ marginTop: 22 }}>
        <JourneyHUD
          trip={active}
          live={live}
          steps={directions?.steps ?? null}
        />
      </View>

      {/* Static walk directions when not live */}
      {!live.active && directions && directions.steps.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <WalkGuidance
            title={
              walkingPhase === "to-stop"
                ? `Walk to ${bus.board.name}`
                : `Walk to ${active.to.label}`
            }
            steps={directions.steps}
            totalDurationSec={directions.durationSec}
            totalDistanceMeters={directions.distanceMeters}
          />
        </View>
      )}

      {/* Live walk directions — highlight current step */}
      {live.active && directions && directions.steps.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <WalkGuidance
            title={
              walkingPhase === "to-dest"
                ? `Walk to ${active.to.label}`
                : `Walk to ${bus.board.name}`
            }
            steps={directions.steps}
            totalDurationSec={directions.durationSec}
            totalDistanceMeters={directions.distanceMeters}
            activeStepIndex={live.currentStepIndex}
          />
        </View>
      )}

      {/* Journey timeline */}
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
            {Math.round(active.option.totalDurationSec / 60)} min total
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
          <TimelineRow
            active={phase === "leave-soon" || phase === "walking"}
            done={phase !== "leave-soon" && phase !== "walking"}
            title={`Walk to ${bus.board.name}`}
            sub={`${Math.round((walkIn.kind === "walk" ? walkIn.durationSec : 0) / 60)} min · ${Math.round(walkIn.kind === "walk" ? walkIn.distanceMeters : 0)} m`}
          />
          <TimelineRow
            active={
              phase === "waiting" ||
              phase === "on-bus" ||
              phase === "alight-soon"
            }
            done={phase === "arrived"}
            title={`Board ${bus.routeShort} · ${bus.routeLong}`}
            sub={`Off at ${bus.alight.name}`}
          />
          <TimelineRow
            active={phase === "alight-soon" || phase === "arrived"}
            done={false}
            title={`Walk to ${active.to.label}`}
            sub={`${Math.round((walkOut.kind === "walk" ? walkOut.durationSec : 0) / 60)} min · ${Math.round(walkOut.kind === "walk" ? walkOut.distanceMeters : 0)} m`}
          />
        </View>
      </View>

      {/* Alight alert */}
      {(phase === "alight-soon" ||
        (phase === "on-bus" && minToAlight <= 3)) && (
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <View
            style={{
              borderRadius: 28,
              padding: 20,
              backgroundColor:
                phase === "alight-soon"
                  ? palette.ochreSoft
                  : "rgba(242,223,196,0.55)",
              borderWidth: 1,
              borderColor:
                phase === "alight-soon"
                  ? "rgba(201,133,58,0.4)"
                  : "rgba(201,133,58,0.25)",
            }}
          >
            <Text style={{ ...KICKER, color: palette.ochre }}>
              {phase === "alight-soon"
                ? "Press stop now"
                : `Get ready — ${Math.max(0, minToAlight)} min`}
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontFamily: "BricolageGrotesque_800ExtraBold",
                fontSize: 24,
                lineHeight: 28,
                letterSpacing: -0.5,
                color: palette.ink,
              }}
            >
              {bus.alight.name}
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
              {phase === "alight-soon"
                ? `Ring the bell — final walk to ${active.to.label} is short.`
                : `${Math.round((walkOut.kind === "walk" ? walkOut.durationSec : 0) / 60)} min walk to go after this stop.`}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
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
        : "rgba(31,30,24,0.06)";
  const kick =
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
          borderColor: "rgba(31,30,24,0.08)",
        }}
      >
        <Text style={{ ...KICKER, color: kick }}>{title}</Text>
        <Text
          style={{
            marginTop: 4,
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

function PhaseLabel({ phase, delaySec }: { phase: Phase; delaySec: number }) {
  const tone =
    phase === "arrived"
      ? palette.olive
      : phase === "alight-soon"
        ? palette.ochre
        : palette.aegeanDeep;
  const txt =
    phase === "leave-soon"
      ? "Get ready"
      : phase === "walking"
        ? "On your way"
        : phase === "waiting"
          ? "At the stop"
          : phase === "on-bus"
            ? "On board"
            : phase === "alight-soon"
              ? "Almost there"
              : "Arrived";
  const delay =
    delaySec > 60
      ? `${Math.round(delaySec / 60)} min late`
      : delaySec < -60
        ? `${Math.round(-delaySec / 60)} min early`
        : "on time";
  return (
    <Text style={{ ...KICKER, color: tone }}>
      {txt} · <Text style={{ color: palette.inkSoft }}>{delay}</Text>
    </Text>
  );
}

function PhaseHeadline({
  phase,
  minToLeave,
  minToBoard,
  minToAlight,
  minToDoor,
  boardName,
  alightName,
}: {
  phase: Phase;
  minToLeave: number;
  minToBoard: number;
  minToAlight: number;
  minToDoor: number;
  boardName: string;
  alightName: string;
}) {
  let big = "";
  let small = "";
  if (phase === "leave-soon") {
    big = `Leave in ${Math.max(0, minToLeave)} min`;
    small = `Walk to ${boardName}.`;
  } else if (phase === "walking") {
    big = `Bus in ${Math.max(0, minToBoard)} min`;
    small = `Keep heading for ${boardName}.`;
  } else if (phase === "waiting") {
    big = `Boards in ${Math.max(0, minToBoard)} min`;
    small = `At ${boardName}.`;
  } else if (phase === "on-bus") {
    big = `Off in ${Math.max(0, minToAlight)} min`;
    small = `At ${alightName}.`;
  } else if (phase === "alight-soon") {
    big = "Step off next";
    small = `${alightName}.`;
  } else {
    big = "You're there";
    small = `${Math.max(0, minToDoor)} min walk left.`;
  }
  return (
    <>
      <Text
        style={{
          marginTop: 8,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 36,
          lineHeight: 40,
          letterSpacing: -0.9,
          color: palette.ink,
        }}
      >
        {big}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 18,
          lineHeight: 24,
          letterSpacing: -0.3,
          color: palette.oliveSoft,
        }}
      >
        {small}
      </Text>
    </>
  );
}

function PhaseSub({
  phase,
  walkInSec,
  walkOutSec,
  destName,
  boardName,
  alightName,
  minToDoor,
}: {
  phase: Phase;
  walkInSec: number;
  walkOutSec: number;
  destName: string;
  boardName: string;
  alightName: string;
  minToDoor: number;
}) {
  const text =
    phase === "leave-soon"
      ? `About ${Math.round(walkInSec / 60)} min on foot to the stop.`
      : phase === "walking"
        ? `About ${Math.round(walkInSec / 60)} min to ${boardName}. We'll buzz if the bus slips.`
        : phase === "waiting"
          ? `Wait at ${boardName}. We'll press-stop for you before ${alightName}.`
          : phase === "on-bus"
            ? `Sit back. ${Math.round(walkOutSec / 60)} min walk after ${alightName}.`
            : phase === "alight-soon"
              ? `Ring the bell. ${Math.round(walkOutSec / 60)} min walk to ${destName}.`
              : `${minToDoor} min to ${destName}. Nice one.`;
  return (
    <Text
      style={{
        marginTop: 14,
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

function TimelineRow({
  active,
  done,
  title,
  sub,
}: {
  active: boolean;
  done: boolean;
  title: string;
  sub: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          marginTop: 6,
          backgroundColor: done
            ? palette.olive
            : active
              ? palette.aegeanDeep
              : palette.line,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 16,
            lineHeight: 20,
            color: active ? palette.ink : palette.inkSoft,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: 3,
            fontFamily: "Geist_500Medium",
            fontSize: 12,
            lineHeight: 17,
            color: palette.inkSoft,
          }}
        >
          {sub}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fallback states
// ---------------------------------------------------------------------------

function NoTripState({ topInset }: { topInset: number }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: topInset + 24,
        paddingHorizontal: 20,
        paddingBottom: 48,
      }}
    >
      <Text style={{ ...KICKER, color: palette.aegeanDeep }}>No live trip</Text>
      <Text
        style={{
          marginTop: 10,
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 34,
          lineHeight: 38,
          letterSpacing: -0.8,
          color: palette.ink,
        }}
      >
        Your trip has ended.
      </Text>
      <Text
        style={{
          marginTop: 10,
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 20,
          color: palette.inkSoft,
        }}
      >
        Plan a new door-to-door trip and we'll walk you through it stop by stop.
      </Text>
      <Pressable
        onPress={() => router.replace("/(tabs)/plan")}
        style={({ pressed }) => ({
          marginTop: 20,
          alignSelf: "flex-start",
          backgroundColor: palette.ink,
          paddingHorizontal: 22,
          paddingVertical: 14,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 14,
            color: palette.limestone,
            letterSpacing: -0.2,
          }}
        >
          Plan a new trip
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// Multi-leg experience lives in `MultiLegCompanion` and is dispatched
// from `TripCompanionScreen` above.

