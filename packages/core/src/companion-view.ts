// Single-leg companion: the non-visual glue between the schedule-derived
// view, the GPS journey tracker and the map layer.
//
// `src/routes/trip.$id.tsx` used to carry all of this inline, which meant the
// countdown reconciliation (schedule vs. GPS) and the marker rules were
// untestable and silently diverged from the native companion. They are pure
// functions over plain numbers and points, so they live here.

import type { SingleLegPhase } from "./single-leg-phase";

export type LatLng = { lat: number; lng: number };

export type WalkEnds = { from: LatLng; to: LatLng } | null;

export type CompanionMarker = {
  lat: number;
  lng: number;
  kind: "origin" | "destination" | "stop";
  label: string;
};

export type MarkerInput = {
  walkingPhase: "to-stop" | "to-dest" | null;
  /** Access walk ends (origin → boarding stop); null when the leg is not a walk. */
  walkIn: WalkEnds;
  /** Egress walk ends (alighting stop → destination); null when not a walk. */
  walkOut: WalkEnds;
  originLabel: string;
  destLabel: string;
  boardName: string;
  alightName: string;
};

/**
 * Markers for the companion map. While the rider is on one of the walks we
 * show only that walk's two ends, so the map can zoom to the part that is
 * actually being navigated; otherwise we show both stops as an overview.
 */
export function buildCompanionMarkers(i: MarkerInput): CompanionMarker[] {
  const out: CompanionMarker[] = [];
  if (i.walkingPhase === "to-stop" && i.walkIn) {
    out.push({ ...i.walkIn.from, kind: "origin", label: i.originLabel });
    out.push({ ...i.walkIn.to, kind: "stop", label: i.boardName });
    return out;
  }
  if (i.walkingPhase === "to-dest" && i.walkOut) {
    out.push({ ...i.walkOut.from, kind: "stop", label: i.alightName });
    out.push({ ...i.walkOut.to, kind: "destination", label: i.destLabel });
    return out;
  }
  if (i.walkIn) out.push({ ...i.walkIn.to, kind: "stop", label: i.boardName });
  if (i.walkOut) out.push({ ...i.walkOut.from, kind: "destination", label: i.alightName });
  return out;
}

export type Countdowns = {
  minToBoard: number;
  minToAlight: number;
  minToDoor: number;
};

export type LiveEtaInput = {
  phase: SingleLegPhase;
  walkOutSec: number;
  live: {
    active: boolean;
    /** GPS-fused seconds until the rider can board; ≤ 0 when unknown. */
    secsToBoard: number;
    /** GPS-fused seconds until the alighting stop; ≤ 0 when unknown. */
    fusedSecsToAlight: number;
  } | null;
};

/**
 * Reconciles the schedule countdowns with the GPS tracker so the hero card
 * can never contradict the HUD. The tracker only wins where it has a real
 * estimate and where that estimate is meaningful for the current phase.
 */
export function applyLiveEta(base: Countdowns, i: LiveEtaInput): Countdowns {
  const live = i.live;
  if (!live?.active) return base;
  const out = { ...base };

  if (live.secsToBoard > 0 && (i.phase === "walking" || i.phase === "waiting")) {
    out.minToBoard = Math.max(0, Math.round(live.secsToBoard / 60));
  }

  if (live.fusedSecsToAlight > 0 && (i.phase === "on-bus" || i.phase === "alight-soon")) {
    out.minToAlight = Math.round(live.fusedSecsToAlight / 60);
    out.minToDoor = Math.round((live.fusedSecsToAlight + i.walkOutSec) / 60);
  }

  return out;
}

/** Which honest-state banner, if any, the companion should show. */
export function feedBannerVariant(live: {
  active: boolean;
  tripGhost?: boolean;
  feedStale?: boolean;
  vehicleLost?: boolean;
  vehicleNotTracked?: boolean;
}): "ghost-bus" | "feed-stale" | "vehicle-lost" | "next-not-tracked" | null {
  if (!live.active) return null;
  // Order matters: the most specific cause of a missing bus wins, so the
  // rider is never told "feed is stale" when we know the trip itself is gone.
  if (live.tripGhost && !live.vehicleLost) return "ghost-bus";
  if (!live.tripGhost && live.feedStale) return "feed-stale";
  if (!live.feedStale && !live.tripGhost && live.vehicleLost) return "vehicle-lost";
  if (!live.feedStale && !live.vehicleLost && !live.tripGhost && live.vehicleNotTracked) {
    return "next-not-tracked";
  }
  return null;
}
