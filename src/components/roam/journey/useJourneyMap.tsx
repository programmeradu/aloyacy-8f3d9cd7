// Map content for a journey with changes: one coloured segment per ride
// (road shape when the shape index knows the trip), dotted walks, a pin at
// the first boarding stop and a change pin at every change point.
import { useEffect, useMemo, useState } from "react";
import type { Itinerary } from "@/lib/itinerary-types";
import type { DomPin } from "@/components/map/useDomPins";
import type { MapSegment } from "@/components/map/types";
import { getShapeForTrip, getShapeForTripSync } from "@/lib/shapes";
import { journeyParts, journeySegments, type LatLng } from "./journey-model";
import { BoardPin, ChangePin } from "./JourneyParts";

function shapeLookup(tripId: string, routeId: string): LatLng[] | null {
  const strip = (s: string) => s.replace(/^\d+:/, "");
  return (
    getShapeForTripSync(tripId, routeId) ??
    getShapeForTripSync(strip(tripId), strip(routeId)) ??
    null
  );
}

export function useJourneyMap(itin: Itinerary | null | undefined): {
  segments: MapSegment[];
  pins: DomPin[];
} {
  const [shapesReady, setShapesReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getShapeForTrip("__warmup__")
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setShapesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const segments = useMemo(
    () => (itin ? journeySegments(itin, shapesReady ? shapeLookup : undefined) : []),
    [itin, shapesReady],
  );

  const pins = useMemo<DomPin[]>(() => {
    if (!itin) return [];
    const p = journeyParts(itin);
    const out: DomPin[] = [];
    const first = p.rides[0];
    if (first) {
      out.push({
        id: "jl-board",
        lat: first.board.lat,
        lng: first.board.lng,
        anchor: "bottom",
        priority: 2,
        node: <BoardPin ride={first} />,
      });
    }
    p.changes.forEach((ch, i) => {
      out.push({
        id: `jl-change-${i}`,
        lat: ch.to.board.lat,
        lng: ch.to.board.lng,
        anchor: "bottom",
        priority: 3,
        node: <ChangePin next={ch.to} />,
      });
    });
    return out;
  }, [itin]);

  return { segments, pins };
}
