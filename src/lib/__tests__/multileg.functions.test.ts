import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";
import type { Itinerary, RideLeg } from "../itinerary-types";

const NICOSIA = { lat: 35.1856, lng: 33.3823 };
const LIMASSOL = { lat: 34.707, lng: 33.022 };

const state = {
  live: { itineraries: [] as Itinerary[], diagnostics: undefined as unknown },
  liveThrows: null as Error | null,
  sched: { itineraries: [] as Itinerary[], diagnostics: { x: 1 } as unknown },
  schedThrows: null as Error | null,
  skips: 0,
};

class FakeNoScheduleAvailableError extends Error {
  date: string;
  constructor(date: string) {
    super(`No timetable shard for ${date}`);
    this.date = date;
  }
}

vi.mock("../journey-multileg.server", () => ({
  planMultiLegJourney: vi.fn(async () => {
    if (state.liveThrows) throw state.liveThrows;
    return { itineraries: state.live.itineraries, diagnostics: state.live.diagnostics };
  }),
}));

vi.mock("../journey-scheduled.server", () => ({
  planMultiLegScheduled: vi.fn(async () => {
    if (state.schedThrows) throw state.schedThrows;
    return { itineraries: state.sched.itineraries, diagnostics: state.sched.diagnostics };
  }),
  localDateForUnix: (unix: number) => {
    const d = new Date(unix * 1000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  },
  NoScheduleAvailableError: FakeNoScheduleAvailableError,
}));

vi.mock("../overrides.server", () => ({
  getSkippedTransferCount: vi.fn(async () => state.skips),
}));

vi.mock("../planner-learning.server", () => ({
  loadPlannerLearningContext: vi.fn(async () => ({})),
  rescoreItineraryWithLearning: vi.fn(() => {}),
}));

const { planMultiLeg } = await import("../multileg.functions");

let idCounter = 0;
function makeItinerary(over: Partial<Itinerary> = {}): Itinerary {
  idCounter++;
  const board = {
    stopId: "s1",
    name: "Stop A",
    lat: NICOSIA.lat,
    lng: NICOSIA.lng,
    departureUnix: 1_700_000_000,
  };
  const alight = {
    stopId: "s2",
    name: "Stop B",
    lat: LIMASSOL.lat,
    lng: LIMASSOL.lng,
    arrivalUnix: 1_700_001_800,
  };
  const ride: RideLeg = {
    kind: "ride",
    routeId: `r${idCounter}`,
    routeShort: `${idCounter}`,
    routeLong: `Route ${idCounter}`,
    tripId: `t${idCounter}`,
    live: true,
    board,
    alight,
    stopCount: 3,
    delaySec: 0,
  };
  return {
    id: `it-${idCounter}`,
    legs: [ride],
    totalDurationSec: 1800,
    departureUnix: board.departureUnix,
    arrivalUnix: alight.arrivalUnix,
    transfers: 0,
    totalWalkMeters: 0,
    score: 1800,
    source: "live",
    ...over,
  };
}

describe("planMultiLeg", () => {
  beforeEach(() => {
    idCounter = 0;
    state.live = { itineraries: [], diagnostics: undefined };
    state.liveThrows = null;
    state.sched = { itineraries: [], diagnostics: { x: 1 } };
    state.schedThrows = null;
    state.skips = 0;
    vi.useRealTimers();
  });

  it("rejects an out-of-range point at the validator boundary", async () => {
    await expect(
      callServerFn(planMultiLeg, { from: { lat: 0, lng: 0 }, to: LIMASSOL }),
    ).rejects.toThrow();
  });

  it("returns an empty result when nothing plans", async () => {
    const out = await callServerFn(planMultiLeg, { from: NICOSIA, to: LIMASSOL, mode: "both" });
    expect(out.itineraries).toEqual([]);
    expect(out.mode).toBe("both");
    expect(out.diagnostics).toBeUndefined();
  });

  it("merges live and scheduled results, deduping identical rides", async () => {
    const a = makeItinerary({ id: "a", source: "live", score: 100 });
    const b = { ...makeItinerary({ id: "b", source: "estimated", score: 200 }), legs: a.legs };
    state.live.itineraries = [a];
    state.sched.itineraries = [b];
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: LIMASSOL,
      mode: "both",
      debug: true,
    });
    expect(out.itineraries).toHaveLength(1);
    expect(out.itineraries[0]?.source).toBe("live");
    expect(out.diagnostics?.mergedRaw).toBe(2);
    expect(out.diagnostics?.afterDedup).toBe(1);
  });

  it("drops itineraries that exceed the max journey cap but rescues the shortest when all are wiped", async () => {
    const tooLong = makeItinerary({
      id: "long",
      totalDurationSec: 400 * 60,
      legs: [
        {
          kind: "ride",
          routeId: "rl",
          routeShort: "L",
          routeLong: "Long",
          tripId: "tl",
          live: true,
          board: {
            stopId: "s1",
            name: "A",
            lat: NICOSIA.lat,
            lng: NICOSIA.lng,
            departureUnix: 1_700_000_000,
          },
          alight: {
            stopId: "s2",
            name: "B",
            lat: LIMASSOL.lat,
            lng: LIMASSOL.lng,
            arrivalUnix: 1_700_000_000 + 400 * 60,
          },
          stopCount: 3,
          delaySec: 0,
        } as RideLeg,
      ],
      departureUnix: 1_700_000_000,
      arrivalUnix: 1_700_000_000 + 400 * 60,
    });
    state.live.itineraries = [tooLong];
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: LIMASSOL,
      mode: "live",
      debug: true,
    });
    expect(out.diagnostics?.dropped?.tooLong).toBe(1);
    // Rescued as last resort so the rider isn't told "no route exists".
    expect(out.itineraries).toHaveLength(1);
  });

  it("honours arriveByUnix by dropping late arrivals", async () => {
    const onTime = makeItinerary({ id: "ontime", arrivalUnix: 1_700_000_000 });
    const late = makeItinerary({ id: "late", arrivalUnix: 1_700_010_000 });
    state.live.itineraries = [onTime, late];
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: LIMASSOL,
      mode: "live",
      arriveByUnix: 1_700_000_500,
      debug: true,
    });
    expect(out.diagnostics?.dropped?.arriveBy).toBe(1);
  });

  it("applies no-mediocrity pruning: a mediocre transfer loses to the best direct option", async () => {
    const direct = makeItinerary({
      id: "direct",
      transfers: 0,
      totalDurationSec: 1000,
      score: 1000,
    });
    const barelyBetterTransfer = makeItinerary({
      id: "transfer",
      transfers: 1,
      totalDurationSec: 950,
      score: 950,
      legs: [{ ...(direct.legs[0] as RideLeg), routeId: "other-route" }],
    });
    state.live.itineraries = [direct, barelyBetterTransfer];
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: LIMASSOL,
      mode: "live",
      debug: true,
    });
    // 50s / 180s / 5% margin: too small to beat direct, so it's pruned.
    expect(out.diagnostics?.prunedMediocre).toBe(1);
    expect(out.itineraries.map((i) => i.id)).toEqual(["direct"]);
  });

  it("applies a learned skip-transfer penalty once skips reach the threshold", async () => {
    const direct = makeItinerary({
      id: "direct",
      transfers: 0,
      totalDurationSec: 1000,
      score: 1000,
    });
    const muchBetterTransfer = makeItinerary({
      id: "transfer",
      transfers: 1,
      totalDurationSec: 200,
      score: 200,
      legs: [{ ...(direct.legs[0] as RideLeg), routeId: "other-route" }],
    });
    state.live.itineraries = [direct, muchBetterTransfer];
    state.skips = 5;
    const out = await callServerFn(planMultiLeg, { from: NICOSIA, to: LIMASSOL, mode: "live" });
    const transfer = out.itineraries.find((i) => i.id === "transfer");
    // 5 skips * 90s = 450s, capped at 360s bias added to score.
    expect(transfer?.score).toBe(200 + 360);
  });

  it("prunes airport-transfer noise and sorts direct-first for airport queries", async () => {
    const direct = makeItinerary({
      id: "direct",
      transfers: 0,
      totalDurationSec: 3600,
      score: 3600,
    });
    const transfer = makeItinerary({
      id: "transfer",
      transfers: 1,
      totalDurationSec: 3500,
      score: 3500,
      legs: [{ ...(direct.legs[0] as RideLeg), routeId: "other-route" }],
    });
    state.live.itineraries = [direct, transfer];
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: { ...LIMASSOL, label: "Larnaca Airport" },
      mode: "live",
    });
    expect(out.itineraries[0]?.transfers).toBe(0);
  });

  it("surfaces noScheduleAvailable when the scheduled planner has no shard and nothing else plans", async () => {
    state.schedThrows = new FakeNoScheduleAvailableError("20990101");
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: LIMASSOL,
      mode: "scheduled",
    });
    expect(out.noScheduleAvailable).toBe(true);
    expect(out.requestedDate).toBe("20990101");
  });

  it("swallows a live-path failure and still returns scheduled results", async () => {
    state.liveThrows = new Error("live boom");
    state.sched.itineraries = [makeItinerary({ id: "sched-ok" })];
    const out = await callServerFn(planMultiLeg, { from: NICOSIA, to: LIMASSOL, mode: "both" });
    expect(out.itineraries.map((i) => i.id)).toEqual(["sched-ok"]);
  });

  it("applies accessibility weighting without dropping options", async () => {
    const it1 = makeItinerary({ id: "walkA", totalWalkMeters: 50 });
    state.live.itineraries = [it1];
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: LIMASSOL,
      mode: "live",
      a11y: { stepFree: true, preferShade: true, lowFloor: true, maxWalkMeters: 400 },
    });
    expect(out.itineraries).toHaveLength(1);
  });

  it("defaults to scheduled-only mode for far-future departures", async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    state.sched.itineraries = [makeItinerary({ id: "future" })];
    const out = await callServerFn(planMultiLeg, {
      from: NICOSIA,
      to: LIMASSOL,
      departAtUnix: farFuture,
    });
    expect(out.mode).toBe("scheduled");
  });
});
