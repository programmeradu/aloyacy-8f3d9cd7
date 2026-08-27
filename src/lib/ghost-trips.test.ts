import { describe, expect, it } from "vitest";
import { ghostCutoffSec, tagGhostTripIds } from "./ghost-trips";

const NOW = 1_700_000_000;
const urban = (routeId: string) => (routeId.startsWith("IC") ? "IC" : "NPT");

describe("ghostCutoffSec", () => {
  it("matches the classifier: urban 180 s, Intercity 300 s", () => {
    expect(ghostCutoffSec("NPT")).toBe(180);
    expect(ghostCutoffSec(undefined)).toBe(180);
    expect(ghostCutoffSec("IC")).toBe(300);
  });
});

describe("tagGhostTripIds", () => {
  const upcoming = {
    tripId: "t1",
    routeId: "NPT:1",
    arrivalUnix: NOW + 600,
  };

  it("tags a trip with no vehicle", () => {
    expect(
      tagGhostTripIds({
        now: NOW,
        arrivals: [upcoming],
        vehicles: [],
        confirmedTripIds: [],
        agencyForRoute: urban,
      }),
    ).toEqual(["t1"]);
  });

  it("does not tag a rider-confirmed trip", () => {
    expect(
      tagGhostTripIds({
        now: NOW,
        arrivals: [upcoming],
        vehicles: [],
        confirmedTripIds: ["t1"],
        agencyForRoute: urban,
      }),
    ).toEqual([]);
  });

  it("tags an urban bus after 180 s and an IC coach only after 300 s", () => {
    const urbanStale = tagGhostTripIds({
      now: NOW,
      arrivals: [upcoming],
      vehicles: [{ tripId: "t1", routeId: "NPT:1", timestamp: NOW - 181 }],
      confirmedTripIds: [],
      agencyForRoute: urban,
    });
    expect(urbanStale).toEqual(["t1"]);

    const icStillPredicted = tagGhostTripIds({
      now: NOW,
      arrivals: [{ ...upcoming, tripId: "t2", routeId: "IC:1" }],
      vehicles: [{ tripId: "t2", routeId: "IC:1", timestamp: NOW - 181 }],
      confirmedTripIds: [],
      agencyForRoute: urban,
    });
    expect(icStillPredicted).toEqual([]);

    const icGhost = tagGhostTripIds({
      now: NOW,
      arrivals: [{ ...upcoming, tripId: "t2", routeId: "IC:1" }],
      vehicles: [{ tripId: "t2", routeId: "IC:1", timestamp: NOW - 301 }],
      confirmedTripIds: [],
      agencyForRoute: urban,
    });
    expect(icGhost).toEqual(["t2"]);
  });
});
