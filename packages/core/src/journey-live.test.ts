import { describe, expect, it } from "vitest";
import {
  JOURNEY_TUNING as T,
  alertForPhase,
  fuseVehicleAndEta,
  resolveLivePhase,
  shouldAutoConfirmBoarding,
  vehicleBasedSecsToBoard,
  type PhaseInput,
} from "./journey-live";

// Nicosia-ish coordinates. ~0.001 deg latitude ≈ 111 m, which makes the
// distances in these fixtures easy to reason about.
const STOP = { lat: 35.17, lng: 33.36 };
const FAR = { lat: 35.2, lng: 33.36 }; // ~3.3 km north of STOP
const DEST = { lat: 35.19, lng: 33.36 };

const near = (base: { lat: number; lng: number }, metresNorth: number) => ({
  lat: base.lat + metresNorth / 111_320,
  lng: base.lng,
});

describe("vehicleBasedSecsToBoard", () => {
  const stops: Record<string, { lat: number; lng: number }> = {
    a: near(STOP, -600),
    b: near(STOP, -300),
    c: STOP,
  };
  const sequences = { "R1|0": ["a", "b", "c"], "R2|0": ["a", "c"] };
  const getStop = (id: string) => stops[id] ?? null;

  it("counts remaining stops plus the run-in from the nearest one", () => {
    const secs = vehicleBasedSecsToBoard({
      vehicle: near(STOP, -600),
      routeId: "R1",
      boardStopId: "c",
      sequences,
      getStop,
    });
    // Sitting on stop "a": two stops left, ~0 m of run-in.
    expect(secs).toBe(2 * T.AVG_INTER_STOP_S);
  });

  it("shrinks as the vehicle moves down the sequence", () => {
    const early = vehicleBasedSecsToBoard({
      vehicle: near(STOP, -600),
      routeId: "R1",
      boardStopId: "c",
      sequences,
      getStop,
    })!;
    const late = vehicleBasedSecsToBoard({
      vehicle: near(STOP, -300),
      routeId: "R1",
      boardStopId: "c",
      sequences,
      getStop,
    })!;
    expect(late).toBeLessThan(early);
  });

  it("prefers the direction with the fewest stops left", () => {
    const secs = vehicleBasedSecsToBoard({
      vehicle: near(STOP, -600),
      routeId: "R2",
      boardStopId: "c",
      sequences,
      getStop,
    });
    expect(secs).toBe(1 * T.AVG_INTER_STOP_S);
  });

  it("returns null when the route has no sequence containing the board stop", () => {
    expect(
      vehicleBasedSecsToBoard({
        vehicle: STOP,
        routeId: "R9",
        boardStopId: "c",
        sequences,
        getStop,
      }),
    ).toBeNull();
  });

  it("returns null when the board stop is first in every sequence", () => {
    expect(
      vehicleBasedSecsToBoard({
        vehicle: STOP,
        routeId: "R1",
        boardStopId: "a",
        sequences,
        getStop,
      }),
    ).toBeNull();
  });

  it("skips stops the lookup cannot resolve", () => {
    expect(
      vehicleBasedSecsToBoard({
        vehicle: STOP,
        routeId: "R1",
        boardStopId: "c",
        sequences,
        getStop: () => null,
      }),
    ).toBeNull();
  });
});

describe("resolveLivePhase", () => {
  const base: PhaseInput = {
    nowUnix: 1_000_000,
    fix: null,
    vehicle: null,
    boardLoc: STOP,
    destLoc: DEST,
    secsToBoard: 600,
    secsToAlight: 900,
    walkingEtaSec: 120,
    boardUnix: 1_000_600,
  };

  it("is walking-to-stop with plenty of slack", () => {
    expect(resolveLivePhase({ ...base, fix: { ...FAR, speedMps: 1.2 } }).phase).toBe(
      "walking-to-stop",
    );
  });

  it("escalates to a soft hurry when the gap closes", () => {
    const r = resolveLivePhase({
      ...base,
      fix: { ...FAR, speedMps: 1.2 },
      secsToBoard: 200,
      walkingEtaSec: 120,
    });
    expect(r.phase).toBe("hurry-soft");
  });

  it("escalates to urgent when the walk is longer than the wait", () => {
    const r = resolveLivePhase({
      ...base,
      fix: { ...FAR, speedMps: 1.2 },
      secsToBoard: 100,
      walkingEtaSec: 300,
    });
    expect(r.phase).toBe("hurry-urgent");
  });

  it("is at-stop when standing at the stop with the bus far off", () => {
    const r = resolveLivePhase({ ...base, fix: { ...STOP, speedMps: 0 }, secsToBoard: 600 });
    expect(r.phase).toBe("at-stop");
  });

  it("prompts boarding once inside the boarding window", () => {
    const r = resolveLivePhase({ ...base, fix: { ...STOP, speedMps: 0 }, secsToBoard: 60 });
    expect(r.phase).toBe("boarding");
  });

  it("prompts boarding when the vehicle pulls up, even outside the window", () => {
    const r = resolveLivePhase({
      ...base,
      fix: { ...STOP, speedMps: 0 },
      vehicle: near(STOP, 20),
      secsToBoard: 600,
    });
    expect(r.phase).toBe("boarding");
  });

  it("prompts boarding when the rider is already away at bus speed", () => {
    const r = resolveLivePhase({
      ...base,
      fix: { ...near(STOP, 150), speedMps: 9 },
      secsToBoard: 30,
    });
    expect(r.phase).toBe("boarding");
    expect(r.onBoardSuggested).toBe(true);
  });

  it("reports on-bus then alight-soon after confirmation", () => {
    const riding = { ...base, onBoardConfirmedAt: 1, fix: { ...FAR, speedMps: 9 } };
    expect(resolveLivePhase(riding).phase).toBe("on-bus");
    expect(resolveLivePhase({ ...riding, secsToAlight: 40 }).phase).toBe("alight-soon");
  });

  it("walks to the destination after alighting, then arrives", () => {
    const off = { ...base, alightedAt: 1, fix: { ...FAR, speedMps: 1.2 } };
    expect(resolveLivePhase(off).phase).toBe("walking-to-dest");
    expect(resolveLivePhase({ ...off, fix: { ...DEST, speedMps: 1 } }).phase).toBe("arrived");
  });

  it("lets an explicit missed flag win over the schedule", () => {
    expect(resolveLivePhase({ ...base, missedAt: 1 }).phase).toBe("missed-bus");
  });

  it("detects a missed bus when it clears the stop without the rider", () => {
    const r = resolveLivePhase({
      ...base,
      nowUnix: 1_000_700,
      boardUnix: 1_000_600,
      fix: { ...near(STOP, 20), speedMps: 0 },
      vehicle: near(STOP, 900),
      secsToBoard: -100,
    });
    expect(r.phase).toBe("missed-bus");
    expect(r.missedSuggested).toBe(true);
  });

  it("does not call it missed while the rider is moving at bus speed", () => {
    const r = resolveLivePhase({
      ...base,
      nowUnix: 1_000_700,
      boardUnix: 1_000_600,
      fix: { ...near(STOP, 20), speedMps: 9 },
      vehicle: near(STOP, 900),
      secsToBoard: -100,
    });
    expect(r.phase).not.toBe("missed-bus");
  });

  it("never suggests boarding once the rider has confirmed", () => {
    const r = resolveLivePhase({
      ...base,
      onBoardConfirmedAt: 1,
      fix: { ...FAR, speedMps: 12 },
    });
    expect(r.onBoardSuggested).toBe(false);
  });
});

describe("shouldAutoConfirmBoarding", () => {
  const riding = { ...near(STOP, 200), speedMps: 9 };

  it("starts the timer on the first qualifying sample", () => {
    const r = shouldAutoConfirmBoarding({
      fix: riding,
      boardLoc: STOP,
      ridingSinceMs: null,
      nowMs: 1_000,
    });
    expect(r).toEqual({ confirm: false, ridingSinceMs: 1_000 });
  });

  it("confirms only after sustained motion", () => {
    const early = shouldAutoConfirmBoarding({
      fix: riding,
      boardLoc: STOP,
      ridingSinceMs: 1_000,
      nowMs: 1_000 + T.SUSTAINED_RIDING_MS - 1,
    });
    expect(early.confirm).toBe(false);
    const late = shouldAutoConfirmBoarding({
      fix: riding,
      boardLoc: STOP,
      ridingSinceMs: 1_000,
      nowMs: 1_000 + T.SUSTAINED_RIDING_MS,
    });
    expect(late).toEqual({ confirm: true, ridingSinceMs: null });
  });

  it("resets when speed drops back to walking", () => {
    const r = shouldAutoConfirmBoarding({
      fix: { ...riding, speedMps: 1.2 },
      boardLoc: STOP,
      ridingSinceMs: 1_000,
      nowMs: 99_000,
    });
    expect(r).toEqual({ confirm: false, ridingSinceMs: null });
  });

  it("resets while still standing at the stop", () => {
    const r = shouldAutoConfirmBoarding({
      fix: { ...STOP, speedMps: 9 },
      boardLoc: STOP,
      ridingSinceMs: 1_000,
      nowMs: 99_000,
    });
    expect(r).toEqual({ confirm: false, ridingSinceMs: null });
  });
});

describe("fuseVehicleAndEta", () => {
  const alight = near(STOP, 2_000);

  it("blends phone and feed when both agree the rider is riding", () => {
    const fix = { ...STOP, speedMps: 9, headingDeg: 12 };
    const vehicle = { ...near(STOP, 50), bearing: 90 };
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix,
      vehicle,
      alightLoc: alight,
      secsToAlight: 600,
    });
    expect(r.vehicleLost).toBe(false);
    expect(r.fusedVehicle!.bearing).toBe(90);
    // 65% weighted toward the feed position.
    expect(r.fusedVehicle!.lat).toBeGreaterThan(fix.lat);
    expect(r.fusedVehicle!.lat).toBeLessThan(vehicle.lat);
  });

  it("falls back to the rider's heading when the feed has none", () => {
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: { ...STOP, speedMps: 9, headingDeg: 33 },
      vehicle: { ...near(STOP, 50) },
      alightLoc: alight,
      secsToAlight: 600,
    });
    expect(r.fusedVehicle!.bearing).toBe(33);
  });

  it("trusts the feed verbatim when the rider isn't provably aboard", () => {
    const vehicle = { ...near(STOP, 50), bearing: 180 };
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: { ...STOP, speedMps: 0.5 },
      vehicle,
      alightLoc: alight,
      secsToAlight: 600,
    });
    expect(r.fusedVehicle).toMatchObject({ lat: vehicle.lat, lng: vehicle.lng, bearing: 180 });
  });

  it("drives the marker from the phone when the feed loses the vehicle", () => {
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: { ...STOP, speedMps: 8, headingDeg: 5 },
      vehicle: null,
      alightLoc: alight,
      secsToAlight: 600,
    });
    expect(r.vehicleLost).toBe(true);
    expect(r.fusedVehicle).toMatchObject({ lat: STOP.lat, bearing: 5 });
  });

  it("has no marker at all without a phone fix or a vehicle", () => {
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: null,
      vehicle: null,
      alightLoc: alight,
      secsToAlight: 600,
    });
    expect(r.fusedVehicle).toBeNull();
    expect(r.fusedSecsToAlight).toBe(600);
  });

  it("prefers the traffic-aware drive ETA over the schedule", () => {
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: { ...STOP, speedMps: 9 },
      vehicle: { ...near(STOP, 50) },
      alightLoc: alight,
      secsToAlight: 600,
      driveEtaSec: 420,
    });
    expect(r.fusedSecsToAlight).toBe(420);
  });

  it("never returns an ETA below the physical floor", () => {
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: { ...STOP, speedMps: 9 },
      vehicle: { ...near(STOP, 50) },
      alightLoc: alight,
      secsToAlight: 600,
      driveEtaSec: 1,
    });
    // ~2 km at the 11 m/s ceiling is roughly 180 s.
    expect(r.fusedSecsToAlight).toBeGreaterThan(150);
  });

  it("never returns a negative ETA", () => {
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: { ...alight, speedMps: 0 },
      vehicle: { ...alight },
      alightLoc: alight,
      secsToAlight: -300,
    });
    expect(r.fusedSecsToAlight).toBe(0);
  });

  it("leaves the schedule untouched without an alight location", () => {
    const r = fuseVehicleAndEta({
      tripId: "t1",
      fix: { ...STOP, speedMps: 9 },
      vehicle: { ...near(STOP, 50) },
      alightLoc: null,
      secsToAlight: 600,
    });
    expect(r.fusedSecsToAlight).toBe(600);
  });
});

describe("alertForPhase", () => {
  const base = {
    onBoardSuggested: false,
    secsToBoard: 310,
    boardName: "Solomou",
    alightName: "Eleftheria",
  };

  it("names the board stop and rounds the countdown for hurry alerts", () => {
    expect(alertForPhase({ ...base, phase: "hurry-soft" })).toEqual({
      key: "hurry-soft",
      kind: "hurry-soft",
      stopName: "Solomou",
      minutes: 5,
      recordsHistory: false,
    });
  });

  it("never shows a negative countdown", () => {
    expect(alertForPhase({ ...base, phase: "at-stop", secsToBoard: -400 })?.minutes).toBe(0);
  });

  it("only asks for boarding confirmation when GPS supports it", () => {
    expect(alertForPhase({ ...base, phase: "boarding" })).toBeNull();
    expect(alertForPhase({ ...base, phase: "boarding", onBoardSuggested: true })?.kind).toBe(
      "confirm-onboard",
    );
  });

  it("names the alight stop for the press-stop nudge", () => {
    expect(alertForPhase({ ...base, phase: "alight-soon" })).toMatchObject({
      kind: "press-stop",
      stopName: "Eleftheria",
    });
  });

  it("records history exactly once, on arrival", () => {
    expect(alertForPhase({ ...base, phase: "arrived" })?.recordsHistory).toBe(true);
    expect(alertForPhase({ ...base, phase: "missed-bus" })?.recordsHistory).toBe(false);
  });

  it("stays silent for phases with nothing to say", () => {
    expect(alertForPhase({ ...base, phase: "idle" })).toBeNull();
    expect(alertForPhase({ ...base, phase: "walking-to-stop" })).toBeNull();
    expect(alertForPhase({ ...base, phase: "on-bus" })).toBeNull();
    expect(alertForPhase({ ...base, phase: "walking-to-dest" })).toBeNull();
  });
});
