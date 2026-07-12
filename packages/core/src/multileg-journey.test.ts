import { describe, expect, it } from "vitest";
import type { Leg, RideLeg, WalkLeg, WaitLeg } from "./itinerary-types";
import {
  fuseAlightEta,
  fuseRideVehicle,
  isConnectionLate,
  legTarget,
  MULTILEG_TUNING,
  multiLegAlerts,
  resolveLegs,
  resolveMultiLegPhase,
  shouldAdvanceLeg,
  shouldAutoConfirmRide,
} from "./multileg-journey";

const NIC = { lat: 35.1717, lng: 33.3642 };

function walk(over: Partial<WalkLeg> = {}): WalkLeg {
  return {
    kind: "walk",
    from: { name: "Home", lat: NIC.lat, lng: NIC.lng },
    to: { name: "Stop A", lat: NIC.lat + 0.005, lng: NIC.lng },
    durationSec: 300,
    distanceMeters: 400,
    verified: true,
    ...over,
  };
}

function ride(over: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "R1",
    routeShort: "150",
    routeLong: "Nicosia — Larnaca",
    tripId: "T1",
    live: true,
    board: { stopId: "A", name: "Stop A", lat: NIC.lat + 0.005, lng: NIC.lng, departureUnix: 1000 },
    alight: { stopId: "B", name: "Stop B", lat: NIC.lat + 0.05, lng: NIC.lng, arrivalUnix: 2000 },
    stopCount: 8,
    delaySec: 0,
    ...over,
  };
}

function wait(over: Partial<WaitLeg> = {}): WaitLeg {
  return {
    kind: "wait",
    stopId: "B",
    name: "Stop B",
    lat: NIC.lat + 0.05,
    lng: NIC.lng,
    durationSec: 240,
    ...over,
  };
}

/** walk → ride → walk → wait → ride → walk */
function twoRideItinerary(): Leg[] {
  return [
    walk(),
    ride(),
    walk({
      from: { name: "Stop B", lat: NIC.lat + 0.05, lng: NIC.lng },
      to: { name: "Stop C", lat: NIC.lat + 0.051, lng: NIC.lng },
    }),
    wait(),
    ride({
      tripId: "T2",
      routeShort: "200",
      board: {
        stopId: "C",
        name: "Stop C",
        lat: NIC.lat + 0.051,
        lng: NIC.lng,
        departureUnix: 3000,
      },
      alight: {
        stopId: "D",
        name: "Stop D",
        lat: NIC.lat + 0.09,
        lng: NIC.lng,
        arrivalUnix: 4000,
      },
    }),
    walk({
      from: { name: "Stop D", lat: NIC.lat + 0.09, lng: NIC.lng },
      to: { name: "Office", lat: NIC.lat + 0.091, lng: NIC.lng },
    }),
  ];
}

describe("resolveLegs", () => {
  it("returns an empty resolution for an empty itinerary", () => {
    const r = resolveLegs([], 3);
    expect(r.currentLeg).toBeNull();
    expect(r.totalRides).toBe(0);
  });

  it("clamps an out-of-range index to the last leg", () => {
    const legs = twoRideItinerary();
    expect(resolveLegs(legs, 99).index).toBe(legs.length - 1);
    expect(resolveLegs(legs, -4).index).toBe(0);
  });

  it("treats the ride ahead of a walk as the current ride", () => {
    const r = resolveLegs(twoRideItinerary(), 0);
    expect(r.currentRideLeg?.tripId).toBe("T1");
    expect(r.nextRideLeg?.tripId).toBe("T2");
    expect(r.rideOrdinal).toBe(1);
    expect(r.totalRides).toBe(2);
    expect(r.ridesBefore).toBe(0);
    expect(r.ridesAfter).toBe(2);
  });

  it("advances the ordinal once past the first ride", () => {
    const r = resolveLegs(twoRideItinerary(), 4);
    expect(r.currentRideLeg?.tripId).toBe("T2");
    expect(r.nextRideLeg).toBeNull();
    expect(r.rideOrdinal).toBe(2);
    expect(r.ridesBefore).toBe(1);
    expect(r.ridesAfter).toBe(0);
  });

  it("exposes the next leg for 'next up' copy", () => {
    expect(resolveLegs(twoRideItinerary(), 1).nextLeg?.kind).toBe("walk");
    expect(resolveLegs(twoRideItinerary(), 5).nextLeg).toBeNull();
  });
});

describe("legTarget", () => {
  it("targets the walk destination, the wait stop, and the board stop", () => {
    expect(legTarget(walk())?.lat).toBeCloseTo(NIC.lat + 0.005);
    expect(legTarget(wait())?.lat).toBeCloseTo(NIC.lat + 0.05);
    expect(legTarget(ride())?.lat).toBeCloseTo(NIC.lat + 0.005);
    expect(legTarget(null)).toBeNull();
  });
});

const basePhase = {
  nowUnix: 1000,
  nowMs: 1_000_000,
  fix: null,
  per: {},
  metersToTarget: 900,
  secsToCurrentAlight: 600,
  nextBoardUnix: 0,
};

describe("resolveMultiLegPhase", () => {
  const legs = twoRideItinerary();

  it("is idle without a current leg", () => {
    expect(
      resolveMultiLegPhase({ ...basePhase, resolution: resolveLegs([], 0) }),
    ).toBe("idle");
  });

  it("names the access, transfer and egress walks distinctly", () => {
    expect(resolveMultiLegPhase({ ...basePhase, resolution: resolveLegs(legs, 0) })).toBe(
      "walking-to-board",
    );
    expect(resolveMultiLegPhase({ ...basePhase, resolution: resolveLegs(legs, 2) })).toBe(
      "walking-to-transfer",
    );
    expect(resolveMultiLegPhase({ ...basePhase, resolution: resolveLegs(legs, 5) })).toBe(
      "walking-to-destination",
    );
  });

  it("flips the access walk to waiting once the rider reaches the stop", () => {
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 0),
        fix: { ...NIC },
        metersToTarget: 10,
      }),
    ).toBe("waiting-to-board");
  });

  it("does not call 'arrived' while GPS still reads the alight stop", () => {
    const alight = { lat: NIC.lat + 0.09, lng: NIC.lng };
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 5),
        fix: alight,
        metersToTarget: 5,
        per: { enteredAt: 1_000_000 - 60_000 },
      }),
    ).toBe("walking-to-destination");
  });

  it("does not call 'arrived' before the settle window elapses", () => {
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 5),
        fix: { lat: NIC.lat + 0.091, lng: NIC.lng },
        metersToTarget: 5,
        per: { enteredAt: 1_000_000 - 5_000 },
      }),
    ).toBe("walking-to-destination");
  });

  it("calls 'arrived' after real displacement plus the settle window", () => {
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 5),
        fix: { lat: NIC.lat + 0.091, lng: NIC.lng },
        metersToTarget: 5,
        per: { enteredAt: 1_000_000 - 60_000 },
      }),
    ).toBe("arrived");
  });

  it("honours a manual 'I'm here' tap regardless of GPS", () => {
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 5),
        per: { arrivedAt: 123 },
      }),
    ).toBe("arrived");
  });

  it("waits for the connection on a wait leg", () => {
    expect(resolveMultiLegPhase({ ...basePhase, resolution: resolveLegs(legs, 3) })).toBe(
      "waiting-for-connection",
    );
  });

  it("stays 'waiting-to-board' on an unconfirmed ride leg", () => {
    expect(resolveMultiLegPhase({ ...basePhase, resolution: resolveLegs(legs, 1) })).toBe(
      "waiting-to-board",
    );
  });

  it("rides once on board and far from the alight stop", () => {
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 1),
        per: { onBoardConfirmedAt: 5 },
        fix: { ...NIC },
      }),
    ).toBe("riding");
  });

  it("needs both proximity and a short ETA before the alight warning", () => {
    const resolution = resolveLegs(legs, 1);
    const near = { lat: NIC.lat + 0.0475, lng: NIC.lng }; // ~280 m out
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution,
        per: { onBoardConfirmedAt: 5 },
        fix: near,
        secsToCurrentAlight: 600,
      }),
    ).toBe("riding");
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution,
        per: { onBoardConfirmedAt: 5 },
        fix: near,
        secsToCurrentAlight: 45,
      }),
    ).toBe("alight-soon");
  });

  it("trusts very close GPS even when the ETA is wrong", () => {
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 1),
        per: { onBoardConfirmedAt: 5 },
        fix: { lat: NIC.lat + 0.0499, lng: NIC.lng },
        secsToCurrentAlight: 900,
      }),
    ).toBe("alight-soon");
  });

  it("holds 'alight-soon' after the rider taps off, until the leg advances", () => {
    expect(
      resolveMultiLegPhase({
        ...basePhase,
        resolution: resolveLegs(legs, 1),
        per: { onBoardConfirmedAt: 5, alightedAt: 9 },
      }),
    ).toBe("alight-soon");
  });

  it("declares a missed connection once the buffer lapses", () => {
    const resolution = resolveLegs(legs, 3);
    expect(
      resolveMultiLegPhase({ ...basePhase, resolution, nowUnix: 3060, nextBoardUnix: 3000 }),
    ).toBe("waiting-for-connection");
    expect(
      resolveMultiLegPhase({ ...basePhase, resolution, nowUnix: 3200, nextBoardUnix: 3000 }),
    ).toBe("missed-connection");
  });
});

describe("fuseRideVehicle", () => {
  it("returns nothing without a ride leg", () => {
    expect(fuseRideVehicle({ currentRideLeg: null, vehicle: null, fix: null, onBoard: true })).toEqual(
      { fusedCurrentVehicle: null, vehicleLost: false },
    );
  });

  it("prefers the feed vehicle", () => {
    const r = fuseRideVehicle({
      currentRideLeg: ride(),
      vehicle: { ...NIC, bearing: 90 },
      fix: { ...NIC, headingDeg: 10 },
      onBoard: true,
    });
    expect(r.vehicleLost).toBe(false);
    expect(r.fusedCurrentVehicle).toMatchObject({ bearing: 90, tripId: "T1" });
  });

  it("falls back to rider GPS when the feed loses the trip on board", () => {
    const r = fuseRideVehicle({
      currentRideLeg: ride(),
      vehicle: null,
      fix: { ...NIC, headingDeg: 45 },
      onBoard: true,
    });
    expect(r.vehicleLost).toBe(true);
    expect(r.fusedCurrentVehicle).toMatchObject({ bearing: 45 });
  });

  it("does not fall back when the rider is not on board", () => {
    expect(
      fuseRideVehicle({ currentRideLeg: ride(), vehicle: null, fix: { ...NIC }, onBoard: false })
        .fusedCurrentVehicle,
    ).toBeNull();
  });
});

describe("fuseAlightEta", () => {
  const alightLoc = { lat: NIC.lat + 0.05, lng: NIC.lng }; // ~5.5 km away
  const busPos = { ...NIC };

  it("passes the schedule through when not on board", () => {
    expect(
      fuseAlightEta({
        onBoard: false,
        fusedVehicle: busPos,
        alightLoc,
        secsToAlight: 300,
        vehicleLost: false,
      }),
    ).toBe(300);
  });

  it("never returns less than the physical distance floor", () => {
    const eta = fuseAlightEta({
      onBoard: true,
      fusedVehicle: busPos,
      alightLoc,
      secsToAlight: 5,
      vehicleLost: false,
    });
    expect(eta).toBeGreaterThan(400); // 5.5 km / 11 m/s
  });

  it("prefers the traffic-aware drive ETA when supplied", () => {
    expect(
      fuseAlightEta({
        onBoard: true,
        fusedVehicle: busPos,
        alightLoc,
        secsToAlight: 300,
        driveEtaSec: 1200,
        vehicleLost: false,
      }),
    ).toBe(1200);
  });

  it("dead-reckons from GPS speed when the vehicle is lost", () => {
    const eta = fuseAlightEta({
      onBoard: true,
      fusedVehicle: busPos,
      alightLoc,
      secsToAlight: 60,
      gpsSpeedMps: 10,
      vehicleLost: true,
    });
    expect(eta).toBeGreaterThan(500);
  });

  it("blends GPS speed with the schedule while moving", () => {
    const eta = fuseAlightEta({
      onBoard: true,
      fusedVehicle: busPos,
      alightLoc,
      secsToAlight: 600,
      gpsSpeedMps: 8,
      vehicleLost: false,
    });
    expect(eta).toBeGreaterThan(500);
    expect(eta).toBeLessThan(900);
  });

  it("freezes at the floor when the bus is stopped", () => {
    const eta = fuseAlightEta({
      onBoard: true,
      fusedVehicle: alightLoc,
      alightLoc,
      secsToAlight: 0,
      gpsSpeedMps: 0,
      vehicleLost: false,
    });
    expect(eta).toBe(0);
  });
});

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
