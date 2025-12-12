// ============================================================
// Alighting cascade. Drives the three rider cues:
//   400 m: "Get ready"     — soft haptic + chime
//   150 m: "Stop next"     — voice + ring-bell hint
//    50 m + decelerating: "Press stop now"
//
// Stateful per ride leg so we don't fire the same cue twice.
// Pure function-style API: the caller feeds the current fused
// fix and the alight stop, and gets back the cue (if any) to
// trigger this tick.
// ============================================================

import type { FusedFix } from "./geo-fusion";
import { distanceM } from "./geo";

export type AlightStage = "idle" | "ready" | "next" | "now" | "passed";
export type AlightCue = "ready" | "next" | "now" | null;

export type AlightTarget = {
  lat: number;
  lng: number;
  stopId: string;
};

type Snapshot = {
  distM: number;
  speedMps: number;
  timestamp: number;
};

export class AlightDetector {
  private stage: AlightStage = "idle";
  private targetStopId: string | null = null;
  private history: Snapshot[] = [];
  private passedAt: number | null = null;

  /** Reset when the active leg changes. */
  bind(stopId: string) {
    if (this.targetStopId !== stopId) {
      this.targetStopId = stopId;
      this.stage = "idle";
      this.history = [];
      this.passedAt = null;
    }
  }

  /** Feed a fix; returns the cue to fire this tick (or null). */
  tick(fix: FusedFix | null, target: AlightTarget | null): AlightCue {
    if (!fix || !target) return null;
    this.bind(target.stopId);

    const distM = distanceM(fix, target);
    this.history.push({
      distM,
      speedMps: fix.speedMps,
      timestamp: fix.timestamp,
    });
    if (this.history.length > 8) this.history.shift();

    // Decide the stage transitions in strict order.
    let cue: AlightCue = null;
    if (this.stage === "idle" && distM < 400) {
      this.stage = "ready";
      cue = "ready";
    }
    if (this.stage === "ready" && distM < 150) {
      this.stage = "next";
      cue = "next";
    }
    if (this.stage === "next" && distM < 60 && this.decelerating()) {
      this.stage = "now";
      cue = "now";
    }
    if (this.stage !== "passed" && distM > 80 && this.movingAway()) {
      // We left the stop without firing the press-stop cue —
      // mark passed so the caller can hand off to the early-alight
      // re-route flow.
      if (this.passedAt == null) this.passedAt = fix.timestamp;
      else if (fix.timestamp - this.passedAt > 4_000) this.stage = "passed";
    } else {
      this.passedAt = null;
    }
    return cue;
  }

  getStage(): AlightStage {
    return this.stage;
  }

  /** True when the bus has clearly overshot the alight stop. */
  hasPassed(): boolean {
    return this.stage === "passed";
  }

  private decelerating(): boolean {
    if (this.history.length < 3) return true; // be generous on cold start
    const recent = this.history.slice(-3);
    return recent[2].speedMps < Math.max(2, recent[0].speedMps * 0.7);
  }

  private movingAway(): boolean {
    if (this.history.length < 3) return false;
    const last = this.history[this.history.length - 1];
    const prev = this.history[this.history.length - 3];
    return last.distM > prev.distM + 8;
  }
}
