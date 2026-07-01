// Proactive Disruption Assistant — native mirror of
// `src/lib/useDisruptionWatch.ts`. Pure derivation from MultiLegLive +
// ActiveTrip: no effects, no network. Surfaces a single, debounced
// signal for the mobile DisruptionBanner to render mid-trip.

import { useMemo } from "react";
import type { MultiLegLive } from "./useMultiLegJourney";
import type { ActiveTrip } from "./trip-store";
import type { RideLeg } from "./journey-types";

export type DisruptionKind =
  | "running-late"
  | "connection-at-risk"
  | "missed-connection"
  | "vehicle-lost-feed"
  | "ghost-pre-board"
  | "late-pre-board";

export type DisruptionSignal = {
  kind: DisruptionKind;
  slipMin: number;
  title: string;
  body: string;
  suggestReplan: boolean;
};

const LATE_THRESHOLD_SEC = 5 * 60;
const PRE_BOARD_LATE_THRESHOLD_SEC = 8 * 60;
const PRE_BOARD_HORIZON_SEC = 30 * 60;
const CONNECTION_RISK_BUFFER_SEC = 60;

export function useDisruptionWatch(
  active: ActiveTrip | null,
  live: MultiLegLive,
): DisruptionSignal | null {
  return useMemo<DisruptionSignal | null>(() => {
    if (!active || !live.active) return null;

    if (live.phase === "missed-connection" && live.nextRideLeg) {
      return {
        kind: "missed-connection",
        slipMin: 0,
        title: "Connection missed",
        body: `Your connection to bus ${live.nextRideLeg.routeShort} has left. Let's find another way to ${active.to.label}.`,
        suggestReplan: true,
      };
    }

    if (
      (live.phase === "riding" || live.phase === "alight-soon") &&
      live.vehicleLost &&
      live.feedStale
    ) {
      return {
        kind: "vehicle-lost-feed",
        slipMin: 0,
        title: "Live tracking interrupted",
        body: "We've lost the bus from the live feed. We'll keep estimating from your phone — alerts may run a moment late.",
        suggestReplan: false,
      };
    }

    if (
      live.currentRideLeg &&
      (live.phase === "walking-to-board" || live.phase === "waiting-to-board") &&
      live.secsToCurrentBoard >= 0 &&
      live.secsToCurrentBoard < PRE_BOARD_HORIZON_SEC
    ) {
      if (live.tripGhost) {
        return {
          kind: "ghost-pre-board",
          slipMin: 0,
          title: `Bus ${live.currentRideLeg.routeShort} hasn't pinged in a while`,
          body: `We've lost the GPS signal for this trip. It may still arrive, but it's worth looking at an alternative to ${active.to.label}.`,
          suggestReplan: true,
        };
      }
      const now2 = Math.floor(Date.now() / 1000);
      const scheduledSecsToBoard = live.currentRideLeg.board.departureUnix - now2;
      const slip = live.secsToCurrentBoard - scheduledSecsToBoard;
      if (slip >= PRE_BOARD_LATE_THRESHOLD_SEC) {
        const slipMin = Math.round(slip / 60);
        return {
          kind: "late-pre-board",
          slipMin,
          title: `Bus ${live.currentRideLeg.routeShort} is ${slipMin} min late`,
          body: `It's slipping before you've even boarded. We can show you faster ways to ${active.to.label}.`,
          suggestReplan: true,
        };
      }
    }

    if (
      live.nextRideLeg &&
      (live.phase === "walking-to-transfer" ||
        live.phase === "waiting-for-connection")
    ) {
      if (
        live.secsToNextBoard > 0 &&
        live.secsToNextBoard < CONNECTION_RISK_BUFFER_SEC &&
        live.phase === "walking-to-transfer"
      ) {
        return {
          kind: "connection-at-risk",
          slipMin: Math.round(
            (CONNECTION_RISK_BUFFER_SEC - live.secsToNextBoard) / 60,
          ),
          title: "Tight connection",
          body: `Bus ${live.nextRideLeg.routeShort} leaves in under a minute. If you miss it we'll find the next one.`,
          suggestReplan: false,
        };
      }
    }

    if (
      (live.phase === "riding" || live.phase === "alight-soon") &&
      live.currentRideLeg
    ) {
      const slip = computeAlightSlipSec(live, live.currentRideLeg);
      if (slip >= LATE_THRESHOLD_SEC) {
        const slipMin = Math.round(slip / 60);
        const suggestReplan = !!live.nextRideLeg;
        return {
          kind: "running-late",
          slipMin,
          title: `Running ${slipMin} min late`,
          body: suggestReplan
            ? "This may put your next connection at risk. Want to look at a faster route?"
            : `You'll reach ${active.to.label} a bit later than planned. Sit tight — we're tracking it.`,
          suggestReplan,
        };
      }
    }

    return null;
  }, [active, live]);
}

function computeAlightSlipSec(live: MultiLegLive, ride: RideLeg): number {
  const now = Math.floor(Date.now() / 1000);
  const projectedAlightUnix = now + live.secsToCurrentAlight;
  return projectedAlightUnix - ride.alight.arrivalUnix;
}
