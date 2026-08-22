// Everything the single-leg live companion needs to render one frame:
// the schedule/live phase, the walking directions for the current phase,
// the journey tracker, the map markers and the rider's own position.
//
// Extracted from src/routes/trip.$id.tsx so the route file is layout and the
// derivation is one auditable place. Hooks run unconditionally and every
// derived value is null-safe, so the caller can early-return freely.

import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deriveSchedulePhase, walkingPhaseFor } from "@aloya/core/single-leg-phase";
import { buildCompanionMarkers } from "@aloya/core/companion-view";
import type { MapMarker } from "@/components/MapPreview";
import { useRealtime } from "@/lib/useRealtime";
import type { useActiveTrip } from "@/lib/trip-store";
import { getWalkingDirections } from "@/lib/maps.functions";
import { useJourney } from "@/lib/useJourney";
import { useCompass } from "@/lib/useCompass";
import { distanceM as haversineMeters, bearingDeg } from "@/lib/geo";
import { useTick } from "@/hooks/use-tick";

type ActiveTrip = ReturnType<typeof useActiveTrip>;

/** A GPS fix must move this far before it can be trusted to imply a heading. */
const HEADING_FIX_MIN_METERS = 5;

export function useSingleLegView(active: ActiveTrip) {
  const { data: rt } = useRealtime();
  const tick = useTick(5_000);
  const fetchDirections = useServerFn(getWalkingDirections);

  const view = useMemo(() => {
    if (!active) return null;
    const now = Math.floor(Date.now() / 1000);
    const bus = active.option.legs.find((l) => l.kind === "bus");
    const walkIn = active.option.legs[0];
    const walkOut = active.option.legs[active.option.legs.length - 1];
    if (!bus || bus.kind !== "bus") return null;
    if (walkIn.kind !== "walk" || walkOut.kind !== "walk") return null;

    // Live re-read of this trip from the realtime feed.
    const liveBoard = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.board.stopId,
    );
    const liveAlight = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.alight.stopId,
    );

    const schedule = deriveSchedulePhase({
      nowUnix: now,
      boardUnix: liveBoard?.arrivalUnix ?? bus.board.departureUnix,
      alightUnix: liveAlight?.arrivalUnix ?? bus.alight.arrivalUnix,
      walkInSec: walkIn.durationSec,
      walkOutSec: walkOut.durationSec,
      // Anchor the walking window to when the rider pressed "Start", not to
      // the schedule: RAPTOR returns the soonest option, so the board time is
      // often already a minute in the past by the time they pick it.
      startedAtUnix: active.live?.startedAt ? Math.floor(active.live.startedAt / 1000) : null,
      onBoard: !!active.live?.onBoardConfirmedAt,
      alighted: !!active.live?.alightedAt,
    });

    return { bus, walkIn, walkOut, delaySec: liveBoard?.delaySec ?? bus.delaySec, ...schedule };
    // `tick` is a deliberate heartbeat that forces countdown recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rt, tick]);

  // Computed defensively so hook order stays stable when the active trip is
  // cleared (e.g. the rider taps "End").
  const walkingPhase = view ? walkingPhaseFor(view.phase, !!active?.live?.alightedAt) : null;
  const walkLeg = view
    ? walkingPhase === "to-stop"
      ? view.walkIn
      : walkingPhase === "to-dest"
        ? view.walkOut
        : null
    : null;
  const walkFrom = walkLeg && walkLeg.kind === "walk" ? walkLeg.from : null;
  const walkTo = walkLeg && walkLeg.kind === "walk" ? walkLeg.to : null;

  const { data: dir } = useQuery({
    queryKey: ["walk", walkFrom?.lat, walkFrom?.lng, walkTo?.lat, walkTo?.lng],
    enabled: !!walkFrom && !!walkTo,
    queryFn: () => fetchDirections({ data: { from: walkFrom!, to: walkTo! } }),
    staleTime: 10 * 60 * 1000,
  });
  const directions = walkingPhase ? (dir?.directions ?? null) : null;

  const live = useJourney({ active, walkingSteps: directions?.steps ?? null, walkingPhase });

  // Compass heading (works while stationary). GPS heading is only valid
  // while moving > ~2 m/s. As a third fallback we derive a bearing from
  // two recent fixes > 5 m apart — covers desktop dev and indoor pre-walk
  // scenarios where neither sensor is reporting.
  const compass = useCompass(live.active);
  const prevFixRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const derivedHeadingRef = useRef<number | null>(null);
  if (live.fix) {
    const prev = prevFixRef.current;
    if (!prev) {
      prevFixRef.current = { lat: live.fix.lat, lng: live.fix.lng, t: live.fix.timestamp };
    } else if (live.fix.timestamp !== prev.t) {
      if (haversineMeters(prev, live.fix) > HEADING_FIX_MIN_METERS) {
        derivedHeadingRef.current = bearingDeg(prev, live.fix);
        prevFixRef.current = { lat: live.fix.lat, lng: live.fix.lng, t: live.fix.timestamp };
      }
    }
  }

  const mapMarkers: MapMarker[] = useMemo(() => {
    if (!view || !active) return [];
    const { bus, walkIn, walkOut } = view;
    return buildCompanionMarkers({
      walkingPhase,
      walkIn: walkIn.kind === "walk" ? { from: walkIn.from, to: walkIn.to } : null,
      walkOut: walkOut.kind === "walk" ? { from: walkOut.from, to: walkOut.to } : null,
      originLabel: active.from.label,
      destLabel: active.to.label,
      boardName: bus.board.name,
      alightName: bus.alight.name,
    });
  }, [walkingPhase, active, view]);

  const userLocation = live.fix
    ? {
        lat: live.fix.lat,
        lng: live.fix.lng,
        accuracyM: live.fix.accuracyM,
        headingDeg:
          compass.headingDeg != null
            ? compass.headingDeg
            : live.fix.headingDeg != null
              ? live.fix.headingDeg
              : derivedHeadingRef.current,
      }
    : null;

  return { view, walkingPhase, directions, live, mapMarkers, userLocation };
}
