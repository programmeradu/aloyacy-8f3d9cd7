// Native multi-leg trip companion. Native mirror of
// `src/components/MultiLegCompanion.tsx` — leg ribbon, phase hero, dual-
// vehicle map, per-phase action HUD, walk turn-by-turn, and a leg
// timeline with the current one highlighted.
//
// Focused on the flight-in-progress experience. Server-side extras from
// the web version (shortcut prompt, last-mile chain, wrong-stop hint) are
// intentionally deferred to keep parity with the mobile single-leg
// companion — they hop through server fns not yet wired for RN.

import { useState } from "react";
import { View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { palette } from "@/constants/theme";
import { MapView } from "@/components/MapView";
import { ShareEtaButton } from "@/components/ShareEtaButton";
import { GroupTripButton } from "@/components/GroupTripButton";
import { CrowdHint } from "@/components/CrowdHint";
import { EarlyAlightSheet } from "@/components/EarlyAlightSheet";
import { DisruptionBanner } from "@/components/DisruptionBanner";
import { TrafficRouteBanner } from "@/components/TrafficRouteBanner";
import type { ActiveTrip } from "@/lib/trip-store";
import {
  multiLegMarkAlighted,
  useMultiLegJourney,
} from "@/lib/useMultiLegJourney";
import { useDisruptionWatch, type DisruptionKind } from "@/lib/useDisruptionWatch";
import { useTrafficWatch } from "@/lib/useTrafficWatch";
import { useMultiLegCompanion } from "@/hooks/useMultiLegCompanion";
import { LegRibbon } from "./multileg/LegRibbon";
import { PhaseLabel, PhaseHeadline, PhaseSub } from "./multileg/PhaseCopy";
import { MultiLegActions } from "./multileg/MultiLegActions";
import { CompanionTopBar } from "./multileg/CompanionTopBar";
import { CompanionBanners } from "./multileg/CompanionBanners";
import { CompanionWalkBlock } from "./multileg/CompanionWalkBlock";
import { CompanionTimeline } from "./multileg/CompanionTimeline";

export function MultiLegCompanion({ active }: { active: ActiveTrip }) {
  const insets = useSafeAreaInsets();
  const live = useMultiLegJourney(active);
  const disruption = useDisruptionWatch(active, live);
  const trafficAlert = useTrafficWatch(active);
  const [replanKind, setReplanKind] = useState<DisruptionKind | "early-alight" | null>(
    null,
  );

  const {
    itin,
    currentWalk,
    directions,
    bounds,
    mapMarkers,
    restrictTripIds,
    vehicleOverrides,
    fix,
    etaMinutes,
  } = useMultiLegCompanion(active, live);

  const handleImOff = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    multiLegMarkAlighted();
  };

  const rideActive =
    live.phase === "riding" ||
    live.phase === "alight-soon" ||
    live.phase === "waiting-to-board";

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
        <CompanionTopBar
          transfers={itin.transfers}
          rideOrdinal={live.rideOrdinal}
          totalRides={live.totalRides}
        />

        <LegRibbon itin={itin} live={live} />

        {/* Phase hero */}
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
          <ShareEtaButton active={active} fix={fix} etaMinutes={etaMinutes} />
          <GroupTripButton active={active} fix={fix} etaMinutes={etaMinutes} />
        </View>

        {trafficAlert && <TrafficRouteBanner alert={trafficAlert} />}

        <DisruptionBanner
          signal={disruption}
          active={active}
          onReplan={() => disruption && setReplanKind(disruption.kind)}
        />

        <CompanionBanners live={live} />

        {live.currentRideLeg && rideActive && (
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
            userLocation={fix}
            fitToContent
          />
        </View>

        <View style={{ marginTop: 22 }}>
          <MultiLegActions
            live={live}
            active={active}
            onImOff={handleImOff}
            onGetOffHere={() => setReplanKind("early-alight")}
          />
        </View>

        {currentWalk && directions && directions.steps.length > 0 && (
          <CompanionWalkBlock
            live={live}
            walk={currentWalk}
            directions={directions}
            destinationLabel={active.to.label}
          />
        )}

        <CompanionTimeline
          itin={itin}
          currentLegIndex={live.currentLegIndex}
          arrived={live.phase === "arrived"}
        />
      </ScrollView>

      <EarlyAlightSheet
        visible={replanKind !== null}
        active={active}
        fix={fix}
        kind={replanKind ?? "early-alight"}
        onClose={() => setReplanKind(null)}
      />
    </>
  );
}
