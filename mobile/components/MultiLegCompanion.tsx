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
import { LongFinalWalkHint } from "@/components/LongFinalWalkHint";
import { ShareEtaButton } from "@/components/ShareEtaButton";
import { GroupTripButton } from "@/components/GroupTripButton";
import { LiveWalkBanner } from "@/components/LiveWalkBanner";
import { CrowdHint } from "@/components/CrowdHint";
import { SightingButton } from "@/components/SightingButton";
import { EarlyAlightSheet } from "@/components/EarlyAlightSheet";
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
import { useDisruptionWatch, type DisruptionKind } from "@/lib/useDisruptionWatch";
import { startLiveTracking } from "@/lib/useJourney";
import { useTrafficWatch } from "@/lib/useTrafficWatch";
import { DisruptionBanner } from "@/components/DisruptionBanner";
import { TrafficRouteBanner } from "@/components/TrafficRouteBanner";
import { fetchWalkingDirections } from "@/lib/walk";
import { boundsForItineraryNative } from "@aloya/core/itinerary-bounds";
import { remainingMinutesToDestination } from "@aloya/core/multileg-eta";
import { KICKER, fmtMin, fmtClock } from "./multileg/kit";
import { LegRibbon } from "./multileg/LegRibbon";
import { PhaseLabel, PhaseHeadline, PhaseSub } from "./multileg/PhaseCopy";
import { MultiLegActions } from "./multileg/MultiLegActions";
import { LegTimelineRow, BannerCard } from "./multileg/LegTimelineRow";
import type {
  Itinerary,
  Leg,
  RideLeg,
  WalkLeg,
  WaitLeg,
} from "@/lib/journey-types";

function etaToDestinationMinutes(live: MultiLegLive, itin: Itinerary): number | null {
  if (!live.active) return null;
  return remainingMinutesToDestination(
    {
      currentLegIndex: live.currentLegIndex,
      secsToCurrentAlight: live.secsToCurrentAlight,
      currentLegDurationSec:
        live.currentLeg && "durationSec" in live.currentLeg
          ? (live.currentLeg.durationSec ?? null)
          : null,
    },
    itin.legs,
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export function MultiLegCompanion({ active }: { active: ActiveTrip }) {
  const insets = useSafeAreaInsets();
  const itin = active.itinerary!;
  const live = useMultiLegJourney(active);
  const disruption = useDisruptionWatch(active, live);
  const trafficAlert = useTrafficWatch(active);
  const [replanKind, setReplanKind] = useState<DisruptionKind | "early-alight" | null>(null);

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
  const bounds = useMemo(() => boundsForItineraryNative(itin), [itin]);
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
    <>
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

      {/* Share ETA + group trip — public link surfaces */}
      <View style={{ paddingHorizontal: 20 }}>
        <ShareEtaButton
          active={active}
          fix={live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null}
          etaMinutes={etaToDestinationMinutes(live, itin)}
        />
        <GroupTripButton
          active={active}
          fix={live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null}
          etaMinutes={etaToDestinationMinutes(live, itin)}
        />
      </View>

      {/* Traffic-on-route (CyNAP DATEX II) — corridor-scoped */}
      {trafficAlert && <TrafficRouteBanner alert={trafficAlert} />}

      {/* Proactive disruption assistant — opens inline replan sheet */}
      <DisruptionBanner
        signal={disruption}
        active={active}
        onReplan={() => disruption && setReplanKind(disruption.kind)}
      />

      {/* Honest banners */}
      {live.active && live.tripGhost && !live.vehicleLost && (
        <BannerCard
          tone="ochre"
          title="Ghost bus"
          body="This trip is on the schedule but the operator hasn't reported it yet. Countdowns are on schedule until GPS appears."
        />
      )}

      {/* Rider sighting CTA — surface when the current bus is a ghost and
          the rider is close enough to the boarding stop to physically
          confirm it. Costs one tap and rescues every other rider. */}
      {live.active &&
        live.tripGhost &&
        live.currentRideLeg &&
        (live.phase === "waiting-to-board" ||
          live.phase === "walking-to-board") &&
        live.metersToTarget < 120 && (
          <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
            <SightingButton
              tripId={live.currentRideLeg.tripId}
              routeId={live.currentRideLeg.routeId}
              stopId={live.currentRideLeg.board.stopId}
              lat={live.currentRideLeg.board.lat}
              lng={live.currentRideLeg.board.lng}
            />
          </View>
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

      {/* Crowd / comfort — surface while a ride leg is active */}
      {live.currentRideLeg &&
        (live.phase === "riding" ||
          live.phase === "alight-soon" ||
          live.phase === "waiting-to-board") && (
          <CrowdHint
            routeId={live.currentRideLeg.routeId}
            tripId={live.currentRideLeg.tripId}
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
        <MultiLegActions
          live={live}
          active={active}
          onImOff={handleImOff}
          onGetOffHere={() => setReplanKind("early-alight")}
        />
      </View>

      {/* Walk turn-by-turn: live banner + full step list */}
      {currentWalk && directions && directions.steps.length > 0 && (
        <>
          {live.phase === "walking-to-destination" && (
            <LongFinalWalkHint
              from={{ lat: currentWalk.from.lat, lng: currentWalk.from.lng }}
              to={{ lat: currentWalk.to.lat, lng: currentWalk.to.lng }}
              distanceMeters={currentWalk.distanceMeters}
              durationSec={currentWalk.durationSec}
              destinationLabel={active.to.label}
            />
          )}
          <LiveWalkBanner
            title={
              live.phase === "walking-to-board"
                ? `To ${currentWalk.to.name}`
                : live.phase === "walking-to-transfer"
                  ? `To bus ${live.nextRideLeg?.routeShort ?? ""}`
                  : `To ${currentWalk.to.name}`
            }
            steps={directions.steps}
            fix={live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null}
            to={{ lat: currentWalk.to.lat, lng: currentWalk.to.lng }}
          />
          <View style={{ marginTop: 20 }}>
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
        </>
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

    <EarlyAlightSheet
      visible={replanKind !== null}
      active={active}
      fix={live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null}
      kind={replanKind ?? "early-alight"}
      onClose={() => setReplanKind(null)}
    />
    </>
  );
}
