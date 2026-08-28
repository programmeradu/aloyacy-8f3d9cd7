import { describe, expect, it } from "vitest";
import { boardKey, parseBoardQuery, pickBoardRows } from "./board-pick";

const NOW = 1_700_000_000;
const routeOf = (id: string) => {
  if (id === "ic45") return { agency: "IC", short: "45" };
  if (id === "npt31") return { agency: "NPT", short: "31" };
  if (id === "lms30") return { agency: "LMS", short: "30" };
  return undefined;
};

describe("parseBoardQuery", () => {
  it("parses agency:short pairs and drops junk", () => {
    expect(parseBoardQuery("IC:45,NPT:31,nope,PFO:615")).toEqual([
      { agency: "IC", short: "45" },
      { agency: "NPT", short: "31" },
      { agency: "PFO", short: "615" },
    ]);
  });

  it("dedupes and caps at 20", () => {
    const q = Array.from({ length: 25 }, (_, i) => `IC:${i}`).join(",");
    expect(parseBoardQuery(`IC:45,IC:45,${q}`)).toHaveLength(20);
  });
});

describe("pickBoardRows", () => {
  it("picks the soonest matching arrival and ignores other agencies", () => {
    const rows = pickBoardRows(
      [{ agency: "IC", short: "45" }],
      [
        { stopId: "a", routeId: "lms30", tripId: "t0", arrivalUnix: NOW + 120, delaySec: 0 },
        { stopId: "b", routeId: "ic45", tripId: "t1", arrivalUnix: NOW + 600, delaySec: 0 },
        { stopId: "c", routeId: "ic45", tripId: "t2", arrivalUnix: NOW + 180, delaySec: 0 },
      ],
      ["t2"],
      [],
      routeOf,
      NOW,
    );
    expect(rows.get(boardKey("IC", "45"))).toMatchObject({
      etaMin: 3,
      source: "live",
      tripId: "t2",
    });
    expect(rows.size).toBe(1);
  });

  it("skips ghost trips unless a rider or vehicle still holds them", () => {
    const rows = pickBoardRows(
      [{ agency: "NPT", short: "31" }],
      [{ stopId: "s", routeId: "npt31", tripId: "ghost", arrivalUnix: NOW + 240, delaySec: 0 }],
      [],
      ["ghost"],
      routeOf,
      NOW,
    );
    expect(rows.size).toBe(0);
  });

  it("labels predicted when there is a tripUpdate but no vehicle", () => {
    const rows = pickBoardRows(
      [{ agency: "IC", short: "45" }],
      [{ stopId: "s", routeId: "ic45", tripId: "tu", arrivalUnix: NOW + 900, delaySec: 120 }],
      [],
      [],
      routeOf,
      NOW,
    );
    expect(rows.get("IC:45")?.source).toBe("predicted");
    expect(rows.get("IC:45")?.etaMin).toBe(15);
  });
});
