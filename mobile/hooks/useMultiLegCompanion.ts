// Side-effect and derivation layer for the native multi-leg companion.
//
// Keeps the screen component declarative: walk directions for the current
// walk leg, map framing/markers/vehicle fusion, phase haptics, and the
// remaining-minutes ETA all resolve here.

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import type { MapMarker, VehicleOverride } from "@/components/MapView";
import { fetchWalkingDirections } from "@/lib/walk";
import type { ActiveTrip } from "@/lib/trip-store";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";
import type { Itinerary, WalkLeg } from "@/lib/journey-types";
import { boundsForItineraryNative } from "@aloya/core/itinerary-bounds";
import { remainingMinutesToDestination } from "@aloya/core/multileg-eta";
import { phaseHaptic } from "@aloya/core/multileg-banners";

export function etaToDestinationMinutes(
  live: MultiLegLive,
  itin: Itinerary,
): number | null {
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

const TRANSFER_PHASES = new Set([
  "walking-to-transfer",
  "waiting-for-connection",
  "missed-connection",
]);

export function useMultiLegCompanion(active: ActiveTrip, live: MultiLegLive) {
  const itin = active.itinerary!;

  const currentWalk: WalkLeg | null =
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

  const bounds = useMemo(() => boundsForItineraryNative(itin), [itin]);

  const restrictTripIds = useMemo(() => {
    const ids: string[] = [];
    if (live.currentRideLeg) ids.push(live.currentRideLeg.tripId);
    if (live.nextRideLeg && TRANSFER_PHASES.has(live.phase)) {
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

  const vehicleOverrides = useMemo<Record<string, VehicleOverride> | undefined>(() => {
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

  const fix = live.fix ? { lat: live.fix.lat, lng: live.fix.lng } : null;

  // Haptic on phase change into alert-worthy states.
  useEffect(() => {
    const cue = phaseHaptic(live.phase);
    if (cue === "heavy") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (cue === "success") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (cue === "warning") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [live.phase]);

  return {
    itin,
    currentWalk,
    directions: walkQuery.data ?? null,
    bounds,
    mapMarkers,
    restrictTripIds,
    vehicleOverrides,
    fix,
    etaMinutes: etaToDestinationMinutes(live, itin),
  };
}
