import { describe, it, expect } from "vitest";
import { annotateRationales } from "./itinerary-rationale";
import type { Itinerary, Leg, RideLeg } from "./itinerary-types";

function ride(over: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "r1",
    routeShort: "30",
    routeLong: "Nicosia — Larnaca",
    tripId: "t1",
    live: true,
    board: { stopId: "a", name: "A", lat: 35, lng: 33, departureUnix: 1_000 },
    alight: { stopId: "b", name: "B", lat: 35.1, lng: 33.1, arrivalUnix: 2_000 },
    stopCount: 6,
    delaySec: 0,
    ...over,
  };
}

function itin(over: Partial<Itinerary> = {}, legs: Leg[] = [ride()]): Itinerary {
  return {
    id: over.id ?? "i",
    legs,
    totalDurationSec: 1_000,
    departureUnix: 1_000,
    arrivalUnix: 2_000,
    transfers: 0,
    totalWalkMeters: 300,
    score: 1,
    source: "live",
    ...over,
    // `legs` is positional so a partial override never silently drops it.
    ...(over.legs ? { legs: over.legs } : {}),
  };
}

const kinds = (it: Itinerary) => (it.rationale ?? []).map((t) => t.kind);

describe("annotateRationales", () => {
  it("leaves an empty set untouched", () => {
    expect(annotateRationales([])).toEqual([]);
  });

  it("never tags a single result — there is nothing to contrast against", () => {
    const [only] = annotateRationales([itin({ id: "solo" })]);
    expect(only.rationale).toBeUndefined();
  });

  it("tags the clearly fastest option and reports whole minutes saved", () => {
    const [fast, slow] = annotateRationales([
      itin({ id: "fast", arrivalUnix: 2_000 }),
      itin({ id: "slow", arrivalUnix: 2_600 }),
    ]);
    expect(kinds(fast)).toContain("fastest");
    expect(fast.rationale?.find((t) => t.kind === "fastest")).toMatchObject({
      minutesEarlier: 10,
    });
    expect(kinds(slow)).not.toContain("fastest");
  });

  it("does not claim 'fastest' for a sub-3-minute margin", () => {
    const [a] = annotateRationales([
      itin({ id: "a", arrivalUnix: 2_000 }),
      itin({ id: "b", arrivalUnix: 2_100 }),
    ]);
    expect(kinds(a)).not.toContain("fastest");
  });

  it("tags a direct trip as no-changes only when a peer has transfers", () => {
    const [direct, withChange] = annotateRationales([
      itin({ id: "direct", transfers: 0 }),
      itin({ id: "change", transfers: 1, arrivalUnix: 2_050 }),
    ]);
    expect(kinds(direct)).toContain("no-changes");
    expect(kinds(withChange)).not.toContain("no-changes");
  });

  it("uses fewer-changes when nobody is direct", () => {
    const [one] = annotateRationales([
      itin({ id: "one", transfers: 1 }),
      itin({ id: "two", transfers: 2, arrivalUnix: 2_050 }),
    ]);
    expect(one.rationale?.[0]).toMatchObject({ kind: "fewer-changes", n: 1 });
  });

  it("tags less-walking past the 150 m threshold and not below it", () => {
    const [lean] = annotateRationales([
      itin({ id: "lean", totalWalkMeters: 200, arrivalUnix: 2_000 }),
      itin({ id: "heavy", totalWalkMeters: 500, arrivalUnix: 2_050 }),
    ]);
    expect(kinds(lean)).toContain("less-walking");

    const [close] = annotateRationales([
      itin({ id: "close", totalWalkMeters: 200, arrivalUnix: 2_000 }),
      itin({ id: "near", totalWalkMeters: 260, arrivalUnix: 2_050 }),
    ]);
    expect(kinds(close)).not.toContain("less-walking");
  });

  it("tags all-live only when a peer is not fully live", () => {
    const [live, mixed] = annotateRationales([
      itin({ id: "live", arrivalUnix: 2_000 }, [ride({ live: true })]),
      itin({ id: "mixed", arrivalUnix: 2_050 }, [ride({ live: false })]),
    ]);
    expect(kinds(live)).toContain("all-live");
    expect(kinds(mixed)).not.toContain("all-live");
  });

  it("tags more-reliable when the peer runs at least 2 minutes later", () => {
    const [onTime] = annotateRationales([
      itin({ id: "ontime", arrivalUnix: 2_000 }, [ride({ delaySec: 0 })]),
      itin({ id: "late", arrivalUnix: 2_050 }, [ride({ delaySec: 400 })]),
    ]);
    expect(kinds(onTime)).toContain("more-reliable");
  });

  it("tags leaves-sooner on the earliest departure", () => {
    const [early] = annotateRationales([
      itin({ id: "early", departureUnix: 1_000, arrivalUnix: 2_000, totalWalkMeters: 300 }),
      itin({ id: "later", departureUnix: 1_200, arrivalUnix: 2_050, totalWalkMeters: 300 }),
    ]);
    expect(kinds(early)).toContain("leaves-sooner");
  });

  it("caps every itinerary at two tags so the UI stays one line", () => {
    const results = annotateRationales([
      itin({ id: "winner", arrivalUnix: 2_000, departureUnix: 1_000, totalWalkMeters: 100 }, [
        ride({ live: true, delaySec: 0 }),
      ]),
      itin(
        {
          id: "loser",
          arrivalUnix: 3_000,
          departureUnix: 1_400,
          totalWalkMeters: 900,
          transfers: 2,
        },
        [ride({ live: false, delaySec: 600 })],
      ),
    ]);
    for (const r of results) expect((r.rationale ?? []).length).toBeLessThanOrEqual(2);
    expect(kinds(results[0])).toContain("fastest");
  });

  it("falls back to best-overall for the top pick when nothing dominates", () => {
    const [top, peer] = annotateRationales([
      itin({ id: "top", arrivalUnix: 2_000, departureUnix: 1_000, totalWalkMeters: 300 }),
      itin({ id: "peer", arrivalUnix: 2_050, departureUnix: 1_010, totalWalkMeters: 300 }),
    ]);
    expect(kinds(top)).toEqual(["best-overall"]);
    expect(peer.rationale).toBeUndefined();
  });
});
