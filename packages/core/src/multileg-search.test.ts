import { describe, expect, it } from "vitest";
import {
  applyDirectPreference,
  buildTripIndex,
  cheapTransferWalk,
  emptyDiagnostics,
  finalise,
  lastEndUnix,
  makeId,
  rankItineraries,
  scoreItinerary,
  searchMultiLeg,
  walkSecFromMeters,
  type MlArrival,
  type MlStop,
} from "./multileg-search";
import type { Itinerary, Leg, RideLeg } from "./itinerary-types";

const NOW = 1_700_000_000;

// A tiny synthetic network: A --r1--> B --r2--> C, with B2 a short walk from B.
const stops: MlStop[] = [
  { id: "A", name: "Alpha", lat: 35.16, lng: 33.36 },
  { id: "B", name: "Beta", lat: 35.18, lng: 33.36 },
  { id: "B2", name: "Beta North", lat: 35.1805, lng: 33.3605 },
  { id: "C", name: "Gamma", lat: 35.2, lng: 33.36 },
  { id: "FAR", name: "Far away", lat: 36.5, lng: 34.9 },
];
const routeById = new Map([
  ["r1", { short: "1", long: "Alpha – Beta" }],
  ["r2", { short: "2", long: "Beta – Gamma" }],
]);

function arr(
  tripId: string,
  routeId: string,
  stopId: string,
  offsetMin: number,
  delaySec = 0,
): MlArrival {
  return { tripId, routeId, stopId, arrivalUnix: NOW + offsetMin * 60, delaySec };
}

function ride(routeId: string, boardUnix: number, alightUnix: number, delaySec = 0): RideLeg {
  return {
    kind: "ride",
    routeId,
    routeShort: routeId,
    routeLong: routeId,
    tripId: `t-${routeId}`,
    live: true,
    board: { stopId: "A", name: "Alpha", lat: 0, lng: 0, departureUnix: boardUnix },
    alight: { stopId: "C", name: "Gamma", lat: 0, lng: 0, arrivalUnix: alightUnix },
    stopCount: 3,
    delaySec,
  };
}

describe("walk maths", () => {
  it("applies the detour factor at 1.35 m/s", () => {
    expect(walkSecFromMeters(1000)).toBe(1000);
    expect(walkSecFromMeters(0)).toBe(0);
  });

  it("returns a zero walk for a same-stop transfer", () => {
    const byId = new Map(stops.map((s) => [s.id, s]));
    expect(cheapTransferWalk(byId, "B", "B")).toEqual({ meters: 0, sec: 0 });
  });

  it("rejects transfer walks beyond the cap and unknown stops", () => {
    const byId = new Map(stops.map((s) => [s.id, s]));
    expect(cheapTransferWalk(byId, "A", "FAR")).toBeNull();
    expect(cheapTransferWalk(byId, "A", "nope")).toBeNull();
    expect(cheapTransferWalk(byId, "B", "B2")).not.toBeNull();
  });
});

describe("buildTripIndex", () => {
  it("drops stale arrivals, sorts visits and indexes by stop", () => {
    const idx = buildTripIndex(
      [
        arr("t1", "r1", "B", 10),
        arr("t1", "r1", "A", 5),
        arr("t1", "r1", "A", -30), // stale, already passed
        arr("t2", "r2", "C", 20),
      ],
      NOW,
    );
    expect(idx.trips.size).toBe(2);
    const t1 = idx.trips.get("t1")!;
    expect(t1.stops.map((s) => s.stopId)).toEqual(["A", "B"]);
    expect(t1.indexOf.get("B")).toBe(1);
    expect(idx.tripsByStop.get("A")).toEqual(["t1"]);
  });

  it("keeps the first index when a trip revisits a stop", () => {
    const idx = buildTripIndex([arr("t1", "r1", "A", 5), arr("t1", "r1", "A", 40)], NOW);
    expect(idx.trips.get("t1")!.indexOf.get("A")).toBe(0);
    expect(idx.trips.get("t1")!.indicesOf.get("A")).toEqual([0, 1]);
  });
});

describe("scoring", () => {
  it("penalises transfers, delay and long walks", () => {
    const base = { totalDurationSec: 1200, transfers: 0, totalWalkMeters: 300, reliabilitySec: 0 };
    expect(scoreItinerary(base)).toBe(1200);
    expect(scoreItinerary({ ...base, transfers: 1 })).toBe(1320);
    expect(scoreItinerary({ ...base, reliabilitySec: 60 })).toBe(1230);
    expect(scoreItinerary({ ...base, totalWalkMeters: 1000 })).toBe(1400);
  });

  it("walks the leg chain to find the arrival time", () => {
    const legs: Leg[] = [
      {
        kind: "walk",
        from: { name: "x", lat: 0, lng: 0 },
        to: { name: "y", lat: 0, lng: 0 },
        durationSec: 300,
        distanceMeters: 400,
        verified: false,
      },
      ride("r1", NOW + 600, NOW + 1800),
    ];
    expect(lastEndUnix(legs, NOW)).toBe(NOW + 1800);
    expect(lastEndUnix([], NOW)).toBe(NOW);
  });

  it("builds a stable id from the ride signature", () => {
    expect(makeId([ride("r1", NOW, NOW + 600)], NOW)).toBe(`ml-r1-A-C-${NOW}`);
  });

  it("finalises transfers and totals", () => {
    const it = finalise(
      [ride("r1", NOW, NOW + 600), ride("r2", NOW + 700, NOW + 1200)],
      NOW,
      "live",
    );
    expect(it.transfers).toBe(1);
    expect(it.totalDurationSec).toBe(1200);
    expect(it.source).toBe("live");
  });
});

describe("rankItineraries", () => {
  const mk = (durationSec: number, transfers: number, routeId: string): Itinerary => {
    const legs: Leg[] =
      transfers === 0
        ? [ride(routeId, NOW, NOW + durationSec)]
        : [
            ride(routeId, NOW, NOW + durationSec / 2),
            ride(`${routeId}b`, NOW + durationSec / 2, NOW + durationSec),
          ];
    const it = finalise(legs, NOW, "live");
    return it;
  };

  it("drops itineraries over the 90 minute cap and explains why", () => {
    const diag = emptyDiagnostics();
    const kept = rankItineraries([mk(100 * 60, 0, "r1")], diag);
    expect(kept).toHaveLength(0);
    expect(diag.reasons[0]).toContain("exceed 90min cap");
  });

  it("prunes transfers that barely beat the best direct", () => {
    const diag = emptyDiagnostics();
    const direct = mk(1800, 0, "r1");
    const marginal = mk(1750, 1, "r2"); // only 50s better
    const kept = rankItineraries([direct, marginal], diag);
    expect(kept.map((k) => k.transfers)).toEqual([0]);
    expect(diag.prunedMediocre).toBe(1);
  });

  it("prunes a transfer that is faster but not enough to justify changing buses", () => {
    const diag = emptyDiagnostics();
    const kept = rankItineraries([mk(3000, 0, "r1"), mk(2460, 1, "r2")], diag);
    expect(kept).toHaveLength(1);
    expect(kept[0].transfers).toBe(0);
  });

  it("keeps a transfer only when it saves at least five minutes and twenty percent", () => {
    const diag = emptyDiagnostics();
    const kept = rankItineraries([mk(3000, 0, "r1"), mk(2100, 1, "r2")], diag);
    expect(kept).toHaveLength(2);
    expect(kept[0].transfers).toBe(1); // faster one ranks first
  });

  it("reapplies direct preference after verified walks change journey totals", () => {
    const direct = mk(3000, 0, "19");
    const transfer = mk(2100, 1, "3");
    expect(applyDirectPreference([direct, transfer])).toHaveLength(2);

    transfer.totalDurationSec = 2460;
    transfer.score = 2580;
    expect(applyDirectPreference([direct, transfer])).toEqual([direct]);
  });

  it("explains an empty candidate set", () => {
    const diag = emptyDiagnostics();
    rankItineraries([], diag);
    expect(diag.reasons[0]).toContain("No live trips visible at any origin stop");
  });
});

describe("searchMultiLeg", () => {
  const from = { lat: 35.1601, lng: 33.36, label: "Home" };
  const to = { lat: 35.2001, lng: 33.36, label: "Work" };

  it("returns nothing when no stop is within walking range", () => {
    const { itineraries, diagnostics } = searchMultiLeg({
      from: { lat: 34.0, lng: 32.0 },
      to,
      stops,
      routeById,
      arrivals: [],
      transferIndex: new Map(),
      now: NOW,
    });
    expect(itineraries).toHaveLength(0);
    expect(diagnostics.reasons.join(" ")).toContain("No stop within");
  });

  it("finds a direct ride when one trip serves both ends", () => {
    const { itineraries, diagnostics } = searchMultiLeg({
      from,
      to,
      stops,
      routeById,
      arrivals: [arr("t1", "r1", "A", 8), arr("t1", "r1", "B", 12), arr("t1", "r1", "C", 20)],
      transferIndex: new Map(),
      now: NOW,
    });
    expect(itineraries).toHaveLength(1);
    expect(itineraries[0].transfers).toBe(0);
    expect(diagnostics.directRawCount).toBe(1);
    const rides = itineraries[0].legs.filter((l): l is RideLeg => l.kind === "ride");
    expect(rides[0].routeShort).toBe("1");
    expect(itineraries[0].legs[0].kind).toBe("walk");
  });

  it("boards a later visit on a circular route when the first visit has passed", () => {
    const loopFrom = { lat: 35.1555, lng: 33.36, label: "Loop entrance" };
    const { itineraries, diagnostics } = searchMultiLeg({
      from: loopFrom,
      to,
      stops,
      routeById,
      arrivals: [
        arr("loop", "r1", "A", 0),
        arr("loop", "r1", "B", 4),
        arr("loop", "r1", "A", 8),
        arr("loop", "r1", "C", 20),
      ],
      transferIndex: new Map(),
      now: NOW,
    });
    expect(diagnostics.directRawCount).toBe(1);
    expect(itineraries).toHaveLength(1);
    const rideLeg = itineraries[0].legs.find((leg): leg is RideLeg => leg.kind === "ride");
    expect(rideLeg?.board.departureUnix).toBe(NOW + 8 * 60);
    expect(rideLeg?.alight.stopId).toBe("C");
  });

  it("skips a bus that leaves before the rider could reach the stop", () => {
    const { itineraries } = searchMultiLeg({
      from: { lat: 35.145, lng: 33.36 }, // ~1.7km from A, a long walk
      to,
      stops,
      routeById,
      arrivals: [arr("t1", "r1", "A", 1), arr("t1", "r1", "C", 20)],
      transferIndex: new Map(),
      now: NOW,
    });
    expect(itineraries).toHaveLength(0);
  });

  it("chains two routes through a walking transfer when no direct trip exists", () => {
    const { itineraries, diagnostics } = searchMultiLeg({
      from,
      to,
      stops,
      routeById,
      arrivals: [
        arr("t1", "r1", "A", 6),
        arr("t1", "r1", "B", 14),
        arr("t2", "r2", "B2", 20),
        arr("t2", "r2", "C", 28),
      ],
      transferIndex: new Map([["B", [{ toStopId: "B2" }]]]),
      now: NOW,
    });
    expect(diagnostics.transferRawCount).toBe(1);
    // The A→B ride also surfaces as a direct option (B is a longer, but legal,
    // walk from the destination), so both shapes come back.
    expect(itineraries).toHaveLength(2);
    const it = itineraries.find((x) => x.transfers === 1)!;
    expect(it).toBeDefined();
    expect(it.legs.filter((l) => l.kind === "walk")).toHaveLength(3); // access, transfer, egress
  });

  it("refuses a transfer that does not clear the minimum buffer", () => {
    const { itineraries, diagnostics } = searchMultiLeg({
      from,
      to,
      stops,
      routeById,
      arrivals: [
        arr("t1", "r1", "A", 6),
        arr("t1", "r1", "B", 14),
        arr("t2", "r2", "B", 14), // same minute — impossible connection
        arr("t2", "r2", "C", 28),
      ],
      transferIndex: new Map(),
      now: NOW,
    });
    expect(diagnostics.transferRawCount).toBe(0);
    // Only the direct A→B ride survives; the impossible connection is dropped.
    expect(itineraries.map((i) => i.transfers)).toEqual([0]);
  });

  it("never counts staying on the same route as a transfer", () => {
    const { diagnostics } = searchMultiLeg({
      from,
      to,
      stops,
      routeById,
      arrivals: [
        arr("t1", "r1", "A", 6),
        arr("t1", "r1", "B", 14),
        arr("t3", "r1", "B", 20),
        arr("t3", "r1", "C", 28),
      ],
      transferIndex: new Map(),
      now: NOW,
    });
    expect(diagnostics.transferRawCount).toBe(0);
  });
});
