import { describe, expect, it } from "vitest";
import {
  fuseAlightEta,
  fuseRideVehicle,
  legTarget,
  resolveLegs,
  resolveMultiLegPhase,
} from "./multileg-journey";
import { NIC, ride, twoRideItinerary, wait, walk } from "./__fixtures__/multileg";

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

  it("points the connection ride at the bus being waited for", () => {
    const legs = twoRideItinerary();
    // access walk → connection is the second ride (first is `currentRideLeg`)
    expect(resolveLegs(legs, 0).connectionRideLeg?.tripId).toBe("T2");
    // riding leg 1 → connection is the ride after
    expect(resolveLegs(legs, 1).connectionRideLeg?.tripId).toBe("T2");
    // transfer walk and wait → the ride they are heading for, not one beyond
    expect(resolveLegs(legs, 2).connectionRideLeg?.tripId).toBe("T2");
    expect(resolveLegs(legs, 3).connectionRideLeg?.tripId).toBe("T2");
    // final egress walk → nothing left to connect to
    expect(resolveLegs(legs, 5).connectionRideLeg).toBeNull();
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
    expect(resolveMultiLegPhase({ ...basePhase, resolution: resolveLegs([], 0) })).toBe("idle");
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
    expect(
      fuseRideVehicle({ currentRideLeg: null, vehicle: null, fix: null, onBoard: true }),
    ).toEqual({ fusedCurrentVehicle: null, vehicleLost: false });
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

