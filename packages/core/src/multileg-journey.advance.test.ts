import { describe, expect, it } from "vitest";
import {
  isConnectionLate,
  MULTILEG_TUNING,
  multiLegAlerts,
  shouldAdvanceLeg,
  shouldAutoConfirmRide,
} from "./multileg-journey";
import { NIC, ride, twoRideItinerary, wait, walk } from "./__fixtures__/multileg";

describe("shouldAdvanceLeg", () => {
  const now = 1_000_000;

  it("never advances past the final egress walk", () => {
    expect(
      shouldAdvanceLeg({
        leg: walk(),
        isFinalLeg: true,
        hasFix: true,
        metersToTarget: 1,
        enteredAt: now - 10_000,
        per: {},
        nowMs: now,
      }),
    ).toBe(false);
  });

  it("advances a walk on arrival", () => {
    expect(
      shouldAdvanceLeg({
        leg: walk(),
        isFinalLeg: false,
        hasFix: true,
        metersToTarget: MULTILEG_TUNING.STOP_ARRIVAL_RADIUS_M - 1,
        per: {},
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("advances a walk on the duration failsafe when GPS is missing", () => {
    expect(
      shouldAdvanceLeg({
        leg: walk({ durationSec: 300 }),
        isFinalLeg: false,
        hasFix: false,
        metersToTarget: 900,
        enteredAt: now - 500_000,
        per: {},
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("advances a wait leg 30 s early", () => {
    const leg = wait({ durationSec: 240 });
    expect(
      shouldAdvanceLeg({
        leg,
        isFinalLeg: false,
        hasFix: false,
        metersToTarget: 0,
        enteredAt: now - 200_000,
        per: {},
        nowMs: now,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceLeg({
        leg,
        isFinalLeg: false,
        hasFix: false,
        metersToTarget: 0,
        enteredAt: now - 215_000,
        per: {},
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("advances a ride only once the rider taps off", () => {
    const base = {
      leg: ride(),
      isFinalLeg: false,
      hasFix: true,
      metersToTarget: 0,
      nowMs: now,
    };
    expect(shouldAdvanceLeg({ ...base, per: {} })).toBe(false);
    expect(shouldAdvanceLeg({ ...base, per: { alightedAt: now } })).toBe(true);
  });

  it("never advances without a leg", () => {
    expect(
      shouldAdvanceLeg({
        leg: null,
        isFinalLeg: false,
        hasFix: true,
        metersToTarget: 0,
        per: {},
        nowMs: now,
      }),
    ).toBe(false);
  });
});

describe("shouldAutoConfirmRide", () => {
  const now = 1_000_000;
  const boardLoc = { lat: NIC.lat + 0.005, lng: NIC.lng };
  const movedAway = { lat: NIC.lat + 0.008, lng: NIC.lng, speedMps: 9 };

  it("ignores non-ride legs and already-resolved legs", () => {
    expect(
      shouldAutoConfirmRide({
        leg: walk(),
        per: {},
        fix: movedAway,
        boardLoc,
        ridingSinceMs: null,
        nowMs: now,
      }).confirm,
    ).toBe(false);
    expect(
      shouldAutoConfirmRide({
        leg: ride(),
        per: { onBoardConfirmedAt: 1 },
        fix: movedAway,
        boardLoc,
        ridingSinceMs: now - 60_000,
        nowMs: now,
      }).confirm,
    ).toBe(false);
  });

  it("requires both bus-speed motion and displacement from the stop", () => {
    expect(
      shouldAutoConfirmRide({
        leg: ride(),
        per: {},
        fix: { ...boardLoc, speedMps: 1 },
        boardLoc,
        ridingSinceMs: now - 60_000,
        nowMs: now,
      }),
    ).toEqual({ confirm: false, ridingSinceMs: null });
    expect(
      shouldAutoConfirmRide({
        leg: ride(),
        per: {},
        fix: { ...boardLoc, speedMps: 9 },
        boardLoc,
        ridingSinceMs: now - 60_000,
        nowMs: now,
      }),
    ).toEqual({ confirm: false, ridingSinceMs: null });
  });

  it("starts the clock, then confirms after the sustained window", () => {
    const started = shouldAutoConfirmRide({
      leg: ride(),
      per: {},
      fix: movedAway,
      boardLoc,
      ridingSinceMs: null,
      nowMs: now,
    });
    expect(started).toEqual({ confirm: false, ridingSinceMs: now });

    expect(
      shouldAutoConfirmRide({
        leg: ride(),
        per: {},
        fix: movedAway,
        boardLoc,
        ridingSinceMs: now,
        nowMs: now + 5_000,
      }).confirm,
    ).toBe(false);

    expect(
      shouldAutoConfirmRide({
        leg: ride(),
        per: {},
        fix: movedAway,
        boardLoc,
        ridingSinceMs: now,
        nowMs: now + MULTILEG_TUNING.SUSTAINED_RIDING_MS,
      }).confirm,
    ).toBe(true);
  });
});

describe("multiLegAlerts", () => {
  const nextRide = ride({ tripId: "T2", routeShort: "200" });

  it("fires the press-stop nudge on alight-soon", () => {
    const [a] = multiLegAlerts({
      phase: "alight-soon",
      legIndex: 1,
      currentRideLeg: ride(),
      nextRideLeg: null,
      secsToNextBoard: 0,
      nextBoardLate: false,
    });
    expect(a).toMatchObject({ key: "press-stop:1", kind: "press-stop", stopName: "Stop B" });
  });

  it("nudges on the transfer walk with rounded minutes", () => {
    const [a] = multiLegAlerts({
      phase: "walking-to-transfer",
      legIndex: 2,
      currentRideLeg: null,
      nextRideLeg: nextRide,
      secsToNextBoard: 250,
      nextBoardLate: false,
    });
    expect(a).toMatchObject({ kind: "at-stop", minutes: 4, routeShort: "200" });
  });

  it("only announces an arriving connection inside the 90 s window", () => {
    const far = multiLegAlerts({
      phase: "waiting-for-connection",
      legIndex: 3,
      currentRideLeg: null,
      nextRideLeg: nextRide,
      secsToNextBoard: 400,
      nextBoardLate: false,
    });
    expect(far).toHaveLength(0);
    const near = multiLegAlerts({
      phase: "waiting-for-connection",
      legIndex: 3,
      currentRideLeg: null,
      nextRideLeg: nextRide,
      secsToNextBoard: 60,
      nextBoardLate: false,
    });
    expect(near[0]).toMatchObject({ key: "connection-arriving:3", minutes: 1 });
  });

  it("warns when the connection is running late, in any phase", () => {
    const alerts = multiLegAlerts({
      phase: "riding",
      legIndex: 1,
      currentRideLeg: ride(),
      nextRideLeg: nextRide,
      secsToNextBoard: 900,
      nextBoardLate: true,
    });
    expect(alerts.map((a) => a.kind)).toEqual(["hurry-soft"]);
  });

  it("tells the rider when the connection was missed", () => {
    const alerts = multiLegAlerts({
      phase: "missed-connection",
      legIndex: 3,
      currentRideLeg: null,
      nextRideLeg: nextRide,
      secsToNextBoard: -200,
      nextBoardLate: false,
    });
    expect(alerts).toEqual([
      {
        key: "missed-connection:3",
        kind: "missed-bus",
        routeShort: "200",
        stopName: "Stop A",
      },
    ]);
  });

  it("fires a single global arrival alert", () => {
    const alerts = multiLegAlerts({
      phase: "arrived",
      legIndex: 5,
      currentRideLeg: null,
      nextRideLeg: null,
      secsToNextBoard: 0,
      nextBoardLate: false,
    });
    expect(alerts).toEqual([{ key: "arrived", kind: "arrived" }]);
  });
});

describe("isConnectionLate", () => {
  it("needs a live time and a 5 min slip", () => {
    expect(isConnectionLate(null, 1000)).toBe(false);
    expect(isConnectionLate(1200, 1000)).toBe(false);
    expect(isConnectionLate(1300, 1000)).toBe(true);
  });
});
