import { describe, expect, it } from "vitest";
import {
  alightAlertFor,
  alightCountdownCopy,
  computeAlightCountdown,
  isAlightCue,
  sequenceForTrip,
  type StopLookup,
} from "./alight-countdown";

// A straight west→east line of stops ~500 m apart at Nicosia's latitude.
const LAT = 35.17;
const STEP = 0.0055; // ≈ 500 m of longitude here
const IDS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6"];
const COORD: Record<string, { name: string; lat: number; lng: number }> = {};
IDS.forEach((id, i) => {
  COORD[id] = { name: `Stop ${i}`, lat: LAT, lng: 33.35 + i * STEP };
});
const getStop: StopLookup = (id) => COORD[id] ?? null;

/** A point `frac` of the way from stop a to stop b. */
function between(a: string, b: string, frac: number) {
  return {
    lat: LAT,
    lng: COORD[a].lng + (COORD[b].lng - COORD[a].lng) * frac,
  };
}

const base = {
  sequence: IDS,
  alightStopId: "s5",
  boardStopId: "s0",
  getStop,
};

describe("computeAlightCountdown — stop counting", () => {
  it("stays calm while the alight stop is far down the line", () => {
    const cd = computeAlightCountdown({ ...base, position: COORD.s0, speedMps: 0 });
    expect(cd.stage).toBe("cruising");
    expect(cd.stopsRemaining).toBe(5);
    expect(cd.hasSequence).toBe(true);
  });

  it("names the stop the bus is standing at", () => {
    const cd = computeAlightCountdown({ ...base, position: COORD.s2, speedMps: 0 });
    expect(cd.atStop).toBe(true);
    expect(cd.currentStop?.stopId).toBe("s2");
    expect(cd.nextStop?.stopId).toBe("s2");
    expect(cd.stopsRemaining).toBe(3);
    expect(cd.stage).toBe("get-ready");
  });

  it("does not treat a bus running past a stop as dwelling there", () => {
    const cd = computeAlightCountdown({ ...base, position: COORD.s2, speedMps: 9 });
    expect(cd.atStop).toBe(false);
  });

  it("advances to the following stop once clear of the current one", () => {
    const cd = computeAlightCountdown({
      ...base,
      position: between("s2", "s3", 0.7),
      speedMps: 8,
    });
    expect(cd.nextStop?.stopId).toBe("s3");
    expect(cd.stopsRemaining).toBe(2);
    expect(cd.stage).toBe("get-ready");
  });

  it("stands the rider by exactly one stop out", () => {
    const cd = computeAlightCountdown({ ...base, position: COORD.s4, speedMps: 0 });
    expect(cd.stopsRemaining).toBe(1);
    expect(cd.stage).toBe("stand-by");
  });

  it("only says press-now after the bus leaves the stop before", () => {
    const dwelling = computeAlightCountdown({ ...base, position: COORD.s4, speedMps: 0 });
    expect(dwelling.stage).toBe("stand-by");
    const moving = computeAlightCountdown({
      ...base,
      position: between("s4", "s5", 0.6),
      speedMps: 8,
    });
    expect(moving.stage).toBe("press-now");
    expect(moving.stopsRemaining).toBe(0);
  });

  it("switches to alighting when standing at the rider's stop", () => {
    const cd = computeAlightCountdown({ ...base, position: COORD.s5, speedMps: 0 });
    expect(cd.stage).toBe("alighting");
  });

  it("reports the stop as passed once behind us", () => {
    const cd = computeAlightCountdown({
      ...base,
      position: between("s5", "s6", 0.8),
      speedMps: 8,
    });
    expect(cd.stage).toBe("passed");
    expect(cd.stopsRemaining).toBeLessThan(0);
  });

  it("never prompts five stops out, the bug this replaces", () => {
    // 2.5 km from the alight stop but only 400 m short in a straight line
    // would have tripped the old distance ladder. Stop counting does not.
    const cd = computeAlightCountdown({ ...base, position: COORD.s1, speedMps: 8 });
    expect(isAlightCue(cd.stage)).toBe(false);
  });

  it("lists every remaining stop in order, ending at the rider's", () => {
    const cd = computeAlightCountdown({ ...base, position: COORD.s2, speedMps: 0 });
    expect(cd.upcoming.map((s) => s.stopId)).toEqual(["s2", "s3", "s4", "s5"]);
    expect(cd.upcoming[0].stopsAway).toBe(0);
    expect(cd.upcoming[3].stopsAway).toBe(3);
  });

  it("survives stops missing from the lookup", () => {
    const gappy: StopLookup = (id) => (id === "s3" ? null : (COORD[id] ?? null));
    const cd = computeAlightCountdown({ ...base, getStop: gappy, position: COORD.s2 });
    expect(cd.stopsRemaining).toBe(3);
    expect(cd.upcoming.map((s) => s.stopId)).toEqual(["s2", "s4", "s5"]);
  });

  it("resolves the second visit of a looped stop", () => {
    const loop = ["s5", "s0", "s1", "s2", "s5"];
    const cd = computeAlightCountdown({
      sequence: loop,
      alightStopId: "s5",
      boardStopId: "s0",
      getStop,
      position: COORD.s2,
      speedMps: 0,
    });
    expect(cd.stopsRemaining).toBe(1);
  });
});

describe("computeAlightCountdown — fallbacks", () => {
  it("returns a calm idle state with nothing to measure", () => {
    const cd = computeAlightCountdown({ ...base, sequence: null, position: null });
    expect(cd.stage).toBe("cruising");
    expect(cd.stopsRemaining).toBeNull();
    expect(cd.hasSequence).toBe(false);
  });

  it("falls back to a distance ladder without a sequence", () => {
    const far = computeAlightCountdown({
      ...base,
      sequence: null,
      position: COORD.s0,
      alightLoc: COORD.s5,
    });
    expect(far.stage).toBe("cruising");
    const close = computeAlightCountdown({
      ...base,
      sequence: null,
      position: between("s4", "s5", 0.8),
      alightLoc: COORD.s5,
      speedMps: 8,
    });
    expect(close.stage).toBe("press-now");
    expect(close.hasSequence).toBe(false);
  });
});

describe("sequenceForTrip", () => {
  const seqs = {
    "19|0": ["a", "b", "c", "d"],
    "19|1": ["d", "c", "b", "a"],
    "12|0": ["x", "y"],
  };

  it("picks the direction where the alight stop comes after the board stop", () => {
    expect(sequenceForTrip(seqs, "19", "c", "a")).toEqual(["d", "c", "b", "a"]);
    expect(sequenceForTrip(seqs, "19", "a", "c")).toEqual(["a", "b", "c", "d"]);
  });

  it("returns null when the route is unknown", () => {
    expect(sequenceForTrip(seqs, "77", "a", "c")).toBeNull();
  });
});

describe("alert + copy", () => {
  it("buzzes only on get-ready and press-now", () => {
    expect(alightAlertFor("cruising", "Kykkou")).toBeNull();
    expect(alightAlertFor("stand-by", "Kykkou")).toBeNull();
    expect(alightAlertFor("get-ready", "Kykkou")?.kind).toBe("alight-ready");
    expect(alightAlertFor("press-now", "Kykkou")?.kind).toBe("press-stop");
  });

  it("tells the rider where the bus is right now", () => {
    const cd = computeAlightCountdown({ ...base, position: COORD.s2, speedMps: 0 });
    const copy = alightCountdownCopy(cd, "Kykkou");
    expect(copy.kicker).toBe("3 stops to go");
    expect(copy.body).toContain("Stop 2");
  });

  it("holds the press instruction until the bus pulls away", () => {
    const standby = computeAlightCountdown({ ...base, position: COORD.s4, speedMps: 0 });
    expect(alightCountdownCopy(standby, "Kykkou").body).toContain("pulls away");
    const press = computeAlightCountdown({
      ...base,
      position: between("s4", "s5", 0.6),
      speedMps: 8,
    });
    expect(alightCountdownCopy(press, "Kykkou").kicker).toBe("Press the stop button");
  });
});
