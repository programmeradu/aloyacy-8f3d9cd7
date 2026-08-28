// Live Trip Companion — single-leg native screen. Mirror of the
// single-leg branch of `src/routes/trip.$id.tsx`.
//
// - Reads the active trip from AsyncStorage-backed `useActiveTrip`.
// - Falls back to a graceful "trip ended" state after end/expiry.
// - Multi-leg itineraries render in `MultiLegCompanion`.
// - Computes schedule-based phase + times via @aloya/core/single-leg-phase,
//   then lets the GPS-truth phase from `useJourney` override it.
// - Renders: header · phase hero · live map · honest feed banners ·
//   JourneyHUD · WalkGuidance · timeline · alight alert.

import { useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { palette } from "@/constants/theme";
import { type MapMarker, type VehicleOverride } from "@/components/MapView";
import { ExpandableMap } from "@/components/ExpandableMap";
import { JourneyHUD } from "@/components/JourneyHUD";
import { ShareEtaButton } from "@/components/ShareEtaButton";
import { WalkGuidance } from "@/components/WalkGuidance";
import { GroupTripButton } from "@/components/GroupTripButton";
import { MultiLegCompanion } from "@/components/MultiLegCompanion";
import { TripHeader } from "@/components/trip/TripHeader";
import { TripHero } from "@/components/trip/TripHero";
import { BannerCard } from "@/components/trip/BannerCard";
import { AlightAlert, JourneyTimeline } from "@/components/trip/JourneyTimeline";
import { NoTripState } from "@/components/trip/NoTripState";
import { useActiveTrip, clearActiveTrip, isMultiLeg } from "@/lib/trip-store";
import { useRealtime } from "@/lib/hooks";
import { fetchWalkingDirections } from "@/lib/walk";
import { useJourney } from "@/lib/useJourney";
import { useTrafficWatch } from "@/lib/useTrafficWatch";
import {
  deriveSchedulePhase,
  resolveHeroPhase,
  shouldShowAlightAlert,
  walkingPhaseFor,
  type LiveJourneyPhase,
} from "@aloya/core/single-leg-phase";
import { resolveWalkAnchor, type WalkAnchor } from "@aloya/core/walk-anchor";

export default function TripCompanionScreen() {
  const insets = useSafeAreaInsets();
  const active = useActiveTrip();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (active && isMultiLeg(active.itinerary)) {
    return <MultiLegCompanion active={active} />;
  }
  return (
    <SingleLegCompanion active={active} hydrated={hydrated} topInset={insets.top} />
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

    const timing = deriveSchedulePhase({
      nowUnix: now,
      boardUnix,
      alightUnix,
      walkInSec: walkIn.durationSec,
      walkOutSec: walkOut.durationSec,
      startedAtUnix: active.live?.startedAt
        ? Math.floor(active.live.startedAt / 1000)
        : null,
      onBoard: !!active.live?.onBoardConfirmedAt,
      alighted: !!active.live?.alightedAt,
    });

    return {
      bus,
      walkIn,
      walkOut,
      delaySec: liveBoard?.delaySec ?? bus.delaySec,
      boardUnix,
      alightUnix,
      ...timing,
    };
  }, [active, rt.data]);

  const alightedAt = active?.live?.alightedAt ?? null;
  const walkingPhase = view ? walkingPhaseFor(view.phase, !!alightedAt) : null;
  const walkLeg = view
    ? walkingPhase === "to-stop"
      ? view.walkIn
      : walkingPhase === "to-dest"
        ? view.walkOut
        : null
    : null;
  const plannedFrom = walkLeg && walkLeg.kind === "walk" ? walkLeg.from : null;
  const walkTo = walkLeg && walkLeg.kind === "walk" ? walkLeg.to : null;

  // The last walk starts wherever the rider actually stepped off, not at the
  // stop the plan nominated — riders overshoot, alight early, or leave by the
  // rear door onto the other side of the road. `useJourney` runs after this
  // (it needs the walk steps), so the anchor uses the fix from the previous
  // frame: one tick of lag on a value that only moves every 60 m.
  const anchorRef = useRef<WalkAnchor | null>(null);
  const lastFixRef = useRef<
    { lat: number; lng: number; accuracyM?: number | null } | null
  >(null);
  const anchor = resolveWalkAnchor({
    planned: plannedFrom,
    fix: lastFixRef.current,
    previous: anchorRef.current,
    useLive: walkingPhase === "to-dest" && !!alightedAt,
  });
  anchorRef.current = anchor;
  const walkFrom = anchor ? { lat: anchor.lat, lng: anchor.lng } : null;

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
  lastFixRef.current = live.fix
    ? { lat: live.fix.lat, lng: live.fix.lng, accuracyM: live.fix.accuracyM }
    : null;

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
      // Anchored to the rider's real position once they've stepped off, so the
      // line on the map starts at their feet rather than at the planned stop.
      const origin = anchor ?? walkOut.from;
      out.push({
        lat: origin.lat,
        lng: origin.lng,
        kind: "stop",
        label: anchor?.live ? "You" : bus.alight.name,
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
  }, [walkingPhase, active, view, anchor]);

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
  if (!active) return <NoTripState topInset={topInset} />;
  if (!view) return null;

  const { bus, walkIn, walkOut, delaySec, phase: schedulePhase } = view;
  let { minToBoard, minToAlight, minToDoor } = view;

  const phase = resolveHeroPhase(schedulePhase, {
    active: live.active,
    phase: live.phase as LiveJourneyPhase,
  });

  const walkInSec = walkIn.kind === "walk" ? walkIn.durationSec : 0;
  const walkOutSec = walkOut.kind === "walk" ? walkOut.durationSec : 0;

  if (live.active && live.secsToBoard > 0 && (phase === "walking" || phase === "waiting")) {
    minToBoard = Math.max(0, Math.round(live.secsToBoard / 60));
  }
  if (
    live.active &&
    live.fusedSecsToAlight > 0 &&
    (phase === "on-bus" || phase === "alight-soon")
  ) {
    minToAlight = Math.round(live.fusedSecsToAlight / 60);
    minToDoor = Math.round((live.fusedSecsToAlight + walkOutSec) / 60);
  }

  const vehicleOverrides: Record<string, VehicleOverride> | undefined = live.fusedVehicle
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

  const userLocation = live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: 72 }}
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
      <TripHeader
        onEnd={() => {
          clearActiveTrip();
          router.replace("/(tabs)/plan");
        }}
      />

      <TripHero
        phase={phase}
        delaySec={delaySec}
        minToLeave={view.minToLeave}
        minToBoard={minToBoard}
        minToAlight={minToAlight}
        minToDoor={minToDoor}
        boardName={bus.board.name}
        alightName={bus.alight.name}
        destName={active.to.label}
        walkInSec={walkInSec}
        walkOutSec={walkOutSec}
        routeShort={bus.routeShort}
        routeLong={bus.routeLong}
        ghost={live.tripGhost}
        from={live.fix}
        dest={active.to}
      />

      {/* Watch together — prominent below the hero so friends can be
          invited before the trip really begins. Returning to this page
          also brings the rider back to their group. */}
      <View style={{ paddingHorizontal: 20, marginTop: 14, gap: 12 }}>
        <ShareEtaButton active={active} fix={userLocation} etaMinutes={minToDoor} />
        <GroupTripButton active={active} fix={userLocation} etaMinutes={minToDoor} />
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
        <BannerCard
          tone="ochre"
          title="Ghost bus"
          body="This trip is on the schedule but the operator hasn't reported it yet. We'll show it the moment a vehicle appears."
        />
      )}
      {live.active && !live.tripGhost && live.feedStale && (
        <BannerCard
          tone="ochre"
          title="Feed is stale"
          body="The live feed hasn't refreshed recently. Countdowns are on schedule until it recovers."
        />
      )}
      {live.active && !live.feedStale && !live.tripGhost && live.vehicleLost && (
        <BannerCard
          tone="aegean"
          title="Tracking from your phone"
          body="We lost the operator vehicle. Using your GPS as the bus until it comes back."
        />
      )}
      {live.active &&
        !live.feedStale &&
        !live.vehicleLost &&
        !live.tripGhost &&
        live.vehicleNotTracked && (
          <BannerCard
            tone="ink"
            title="This run isn't tracked yet"
            body="No GPS from the vehicle for this trip. We're going on schedule for now."
          />
        )}

      <View style={{ marginTop: 22 }}>
        <JourneyHUD trip={active} live={live} steps={directions?.steps ?? null} />
      </View>

      {/* Walk directions — the live pass highlights the current step. */}
      {directions && directions.steps.length > 0 && (
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
            activeStepIndex={live.active ? live.currentStepIndex : undefined}
          />
        </View>
      )}

      <JourneyTimeline
        phase={phase}
        totalDurationSec={active.option.totalDurationSec}
        boardName={bus.board.name}
        alightName={bus.alight.name}
        destName={active.to.label}
        routeShort={bus.routeShort}
        routeLong={bus.routeLong}
        walkInSec={walkInSec}
        walkInMeters={walkIn.kind === "walk" ? walkIn.distanceMeters : 0}
        walkOutSec={walkOutSec}
        walkOutMeters={walkOut.kind === "walk" ? walkOut.distanceMeters : 0}
      />

      {shouldShowAlightAlert(phase, minToAlight) && (
        <AlightAlert
          phase={phase}
          minToAlight={minToAlight}
          alightName={bus.alight.name}
          destName={active.to.label}
          walkOutSec={walkOutSec}
        />
      )}
    </ScrollView>
  );
}
