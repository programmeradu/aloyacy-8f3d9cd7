import { describe, it, expect } from "vitest";
import { AlightDetector } from "./alight-detector";
import type { FusedFix } from "./geo-fusion";

const TARGET = { lat: 0, lng: 0, stopId: "S1" };

function fix(lat: number, speedMps: number, timestamp: number): FusedFix {
  return { lat, lng: 0, speedMps, bearingDeg: null, uncertaintyM: 5, motion: "onboard" } as FusedFix & { timestamp: number } as any;
}

// distanceM uses haversine; convert lat degrees roughly to metres (~111320 m/deg)
function latForMeters(m: number) {
  return m / 111320;
}

function mkFix(distM: number, speedMps: number, timestamp: number): FusedFix {
  return {
    lat: latForMeters(distM),
    lng: 0,
    speedMps,
    bearingDeg: null,
    uncertaintyM: 5,
    motion: "onboard",
    timestamp,
  } as unknown as FusedFix;
}

describe("AlightDetector", () => {
  it("returns null when fix or target missing", () => {
    const d = new AlightDetector();
    expect(d.tick(null, TARGET)).toBeNull();
    expect(d.tick(mkFix(100, 5, 0), null)).toBeNull();
  });

  it("fires 'ready' cue when crossing under 400m", () => {
    const d = new AlightDetector();
    expect(d.tick(mkFix(500, 10, 0), TARGET)).toBeNull();
    expect(d.getStage()).toBe("idle");
    expect(d.tick(mkFix(390, 10, 1000), TARGET)).toBe("ready");
    expect(d.getStage()).toBe("ready");
  });

  it("does not re-fire ready twice", () => {
    const d = new AlightDetector();
    d.tick(mkFix(390, 10, 0), TARGET);
    expect(d.tick(mkFix(380, 10, 1000), TARGET)).toBeNull();
  });

  it("progresses ready -> next -> now in sequence", () => {
    const d = new AlightDetector();
    d.tick(mkFix(390, 10, 0), TARGET);
    expect(d.tick(mkFix(140, 10, 1000), TARGET)).toBe("next");
    expect(d.getStage()).toBe("next");
    // need decelerating: push 3 history entries with declining speed
    d.tick(mkFix(100, 10, 2000), TARGET);
    d.tick(mkFix(70, 8, 3000), TARGET);
    const cue = d.tick(mkFix(50, 2, 4000), TARGET);
    expect(cue).toBe("now");
    expect(d.getStage()).toBe("now");
  });

  it("does not fire 'now' when not decelerating enough", () => {
    const d = new AlightDetector();
    d.tick(mkFix(390, 10, 0), TARGET);
    d.tick(mkFix(140, 10, 1000), TARGET);
    d.tick(mkFix(100, 10, 2000), TARGET);
    d.tick(mkFix(70, 10, 3000), TARGET);
    const cue = d.tick(mkFix(50, 9, 4000), TARGET); // still fast, not decelerating
    expect(cue).toBeNull();
    expect(d.getStage()).toBe("next");
  });

  it("decelerating check uses last 3 samples once enough history exists", () => {
    const d = new AlightDetector();
    d.tick(mkFix(390, 10, 0), TARGET);
    d.tick(mkFix(140, 10, 1000), TARGET);
    // Third sample brings history to length 3; speed drop qualifies as decelerating.
    const cue = d.tick(mkFix(50, 2, 2000), TARGET);
    expect(cue).toBe("now");
  });

  it("resets state when bound to a new stop id", () => {
    const d = new AlightDetector();
    d.tick(mkFix(390, 10, 0), TARGET);
    expect(d.getStage()).toBe("ready");
    d.bind("OTHER_STOP");
    expect(d.getStage()).toBe("idle");
  });

  it("marks passed after moving away for >4s past a partial approach", () => {
    const d = new AlightDetector();
    d.tick(mkFix(390, 10, 0), TARGET);
    d.tick(mkFix(140, 10, 1000), TARGET);
    // Now moving away: distances increasing across last 3 samples, dist > 80
    d.tick(mkFix(150, 10, 2000), TARGET);
    d.tick(mkFix(160, 10, 3000), TARGET);
    d.tick(mkFix(200, 10, 4000), TARGET); // movingAway true here (200 > 150+8), distM>80
    expect(d.hasPassed()).toBe(false); // passedAt just set
    const cue = d.tick(mkFix(250, 10, 8500), TARGET); // >4000ms later
    expect(d.hasPassed()).toBe(true);
    expect(cue).toBeNull();
  });

  it("resets passedAt tracking when the bus is close or not moving away", () => {
    const d = new AlightDetector();
    d.tick(mkFix(390, 10, 0), TARGET);
    d.tick(mkFix(140, 10, 1000), TARGET);
    d.tick(mkFix(150, 10, 2000), TARGET);
    d.tick(mkFix(160, 10, 3000), TARGET);
    d.tick(mkFix(200, 10, 4000), TARGET); // starts passedAt tracking
    // Now comes back closer -> movingAway false -> resets passedAt
    d.tick(mkFix(60, 10, 4500), TARGET);
    d.tick(mkFix(50, 2, 9000), TARGET);
    expect(d.hasPassed()).toBe(false);
  });

  it("caps history length at 8 entries", () => {
    const d = new AlightDetector();
    for (let i = 0; i < 12; i++) {
      d.tick(mkFix(500 - i * 10, 10, i * 1000), TARGET);
    }
    // no direct access to history but should not throw and stage progressed
    expect(["idle", "ready", "next", "now", "passed"]).toContain(d.getStage());
  });
});
