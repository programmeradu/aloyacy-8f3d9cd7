import { describe, expect, it } from "vitest";
import {
  matchScore,
  parseIntent,
  phoneticKey,
  searchLines,
  searchStops,
  toLatin,
} from "./smart-search";

const stops = [
  { id: "1", name: "Eleftheria Square", lat: 35.17, lng: 33.36, agency: "NPT" },
  { id: "2", name: "Eleftherias - Ippokratous", lat: 34.7, lng: 33.0, agency: "LMS" },
  { id: "3", name: "Solomos Square", lat: 35.169, lng: 33.36, agency: "NPT" },
];

describe("smart search", () => {
  it("transliterates Greek and folds Greeklish", () => {
    expect(toLatin("Ελευθερία")).toBe("eleftheria");
    expect(phoneticKey("eleftheria")).toBe(phoneticKey("elefteria"));
    expect(phoneticKey("ελευθερια")).toBe(phoneticKey("Eleftheria"));
  });
  it("finds Eleftheria Square from English, Greek, Greeklish and a typo", () => {
    for (const q of ["eleftheria", "ελευθερια", "elefteria", "eleftheira", "elef sq"]) {
      expect(searchStops(q, stops, { lat: 35.17, lng: 33.36 })[0]?.name, q).toBe(
        "Eleftheria Square",
      );
    }
  });
  it("does not match unrelated names", () => {
    expect(matchScore("airport", "Solomos Square")).toBe(0);
  });
  it("finds lines by number and destination", () => {
    const routes = [
      { id: "a", short: "30", long: "Lakatamia - Solomos", agency: "NPT" },
      { id: "b", short: "330", long: "Strovolos - Solomos", agency: "NPT" },
    ];
    expect(searchLines("30", routes)[0].code).toBe("30");
    expect(searchLines("line 33", routes)[0].code).toBe("330");
  });
  it("parses trip phrasings locally", () => {
    const now = new Date("2026-10-30T19:00:00");
    const a = parseIntent("to Larnaca airport tomorrow 7am", now)!;
    expect(a.to).toBe("larnaca airport");
    expect(new Date(a.leaveAtISO!).getHours()).toBe(7);
    expect(parseIntent("next 30 from here", now)!.line).toBe("30");
    const l = parseIntent("last bus to Limassol", now)!;
    expect(l.edge).toBe("last");
    expect(l.to).toBe("limassol");
    expect(parseIntent("solomos", now)).toBeNull();
  });
});
