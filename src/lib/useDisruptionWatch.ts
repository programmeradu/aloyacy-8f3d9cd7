// Proactive Disruption Assistant.
//
// Watches an active multi-leg journey for material disruptions and
// surfaces a single, debounced signal the UI can render:
//
//   - "running-late"        — current ride's ETA slipped > 5 min vs plan
//   - "connection-at-risk"  — transfer wait window < 60 s and slipping
//   - "missed-connection"   — phase already promoted to missed
//   - "vehicle-lost-feed"   — on-board, both feed stale AND no GPS fix
//
// Pure derivation from MultiLegLive + ActiveTrip — no React effects, no
// network. The hook only memoises the latest signal.

import { useMemo } from "react";
import type { MultiLegLive } from "./useMultiLegJourney";
import type { ActiveTrip } from "./trip-store";
import type { RideLeg } from "./itinerary-types";

export type DisruptionKind =
  | "running-late"
  | "connection-at-risk"
  | "missed-connection"
  | "vehicle-lost-feed"
  // Wave 1.5 — pre-board failures while the rider is still walking to or
  // waiting at the boarding stop. These are the cases where Aloya can
  // most usefully suggest an alternative before the rider commits.
  | "ghost-pre-board"
  | "late-pre-board";

export type DisruptionSignal = {
  kind: DisruptionKind;
  /** Minutes slipped against the planned schedule (signed). */
  slipMin: number;
  /** Short headline copy for the banner. */
  title: string;
  /** One-sentence body, suggests action. */
  body: string;
  /** Whether re-planning would help — drives the CTA visibility. */
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

    // 1) Missed connection wins — most urgent.
    if (live.phase === "missed-connection" && live.nextRideLeg) {
      return {
        kind: "missed-connection",
        slipMin: 0,
        title: "Connection missed",
        body: `Your connection to bus ${live.nextRideLeg.routeShort} has left. Let's find another way to ${active.to.label}.`,
        suggestReplan: true,
      };
    }

    // 2) Vehicle / feed blackout while on board.
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

    // 2b) Pre-board failures — Wave 1.5. Only while the rider is still
    //     walking to or waiting at the boarding stop. We suppress these
    //     once on board (later disruptions take over).
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

    // 3) Connection at risk: walking-to-transfer or waiting, and the
    //    next departure is leaving inside the safety buffer (or already
    //    flagged late by the feed).
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
          slipMin: Math.round((CONNECTION_RISK_BUFFER_SEC - live.secsToNextBoard) / 60),
          title: "Tight connection",
          body: `Bus ${live.nextRideLeg.routeShort} leaves in under a minute. If you miss it we'll find the next one.`,
          suggestReplan: false,
        };
      }
    }

    // 4) Current ride running late vs the planned alight time.
    if (
      (live.phase === "riding" || live.phase === "alight-soon") &&
      live.currentRideLeg
    ) {
      const slip = computeAlightSlipSec(live, live.currentRideLeg);
      if (slip >= LATE_THRESHOLD_SEC) {
        const slipMin = Math.round(slip / 60);
        // Only suggest re-plan if there's a downstream connection we
        // could still rescue, or a long egress; otherwise just inform.
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
