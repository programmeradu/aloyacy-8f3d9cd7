import { describe, expect, it } from "vitest";
import { completeCut, displayPlace, repairHeadsign, splitLongName, wordCut } from "./place-names";

const NAMES = [
  "University of Cyprus - Oceanography Center",
  "University of Cyprus - University House",
  "University of Cyprus - North Campus Entrance",
  "Solomos Square Alighting",
  "Dionysios Solomos Square A",
  "Ave. Stasinou - Arch. Makariou B Square",
];

describe("place-names", () => {
  it("reads separators as commas", () => {
    expect(displayPlace("Ave. Stasinou - Arch. Makariou B Square")).toBe(
      "Ave. Stasinou, Arch. Makariou B Square",
    );
  });

  it("completes a cut headsign to the shared whole words", () => {
    expect(completeCut("University of Cyp", NAMES)).toBe("University of Cyprus");
    expect(repairHeadsign("University of Cyp", NAMES)).toBe("University of Cyprus");
  });

  it("drops the operational Alighting suffix", () => {
    expect(repairHeadsign("Solomos Square Al", NAMES)).toBe("Solomos Square");
  });

  it("cuts an unknown capped headsign on a word with an ellipsis", () => {
    expect(repairHeadsign("Pano Platres Vill", NAMES)).toBe("Pano Platres\u2026");
    expect(wordCut("Ag. Theklas - Wat")).toBe("Ag. Theklas\u2026");
  });

  it("leaves short headsigns whole", () => {
    expect(repairHeadsign("Strovolos", NAMES)).toBe("Strovolos");
  });

  it("completes the cut tail of a long name from the route's stops", () => {
    const r = splitLongName("Dionysios Solomos Square A - University of Cyprus - Nor", {
      routeStopNames: NAMES,
      allNames: NAMES,
    });
    expect(r.origin).toBe("Dionysios Solomos Square A");
    expect(r.dest).toBe("University of Cyprus, North Campus Entrance");
  });

  it("drops a tiny cut fragment it cannot complete", () => {
    const r = splitLongName("Aaaa Bbbbbbbbbbbbbbbbbb - Cccccccccccccccc Ddddddd - Eee", {
      routeStopNames: [],
      allNames: [],
    });
    expect(r.dest).toBe("Cccccccccccccccc Ddddddd");
  });
});
