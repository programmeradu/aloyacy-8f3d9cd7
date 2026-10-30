import { describe, expect, it } from "vitest";
import { filterLines, lineRows, splitLong } from "./lines-data";

const R = [
  { id: "a1", short: "33", long: "Solomou Square - Aglantzia - University of Cyprus", color: "000000", agency: "NPT" },
  { id: "a2", short: "33", long: "University of Cyprus - Solomou Square", color: "000000", agency: "NPT" },
  { id: "b1", short: "400", long: "Solomou Square - Kokkinotrimithia - Astromeritis", color: "000000", agency: "NPT" },
  { id: "c1", short: "33", long: "Limassol - Somewhere", color: "000000", agency: "LMS" },
];

describe("lines-data", () => {
  it("splits origin and destination", () => {
    expect(splitLong("A - B - C")).toEqual({ origin: "A", dest: "C" });
    expect(splitLong("Only")).toEqual({ origin: null, dest: "Only" });
  });
  it("keeps one row per agency and line, sorted numerically", () => {
    const rows = lineRows(R);
    expect(rows.map((r) => `${r.agency}${r.short}`)).toEqual(["NPT33", "LMS33", "NPT400"]);
  });
  it("filters by operator and query", () => {
    const rows = lineRows(R);
    expect(filterLines(rows, "NPT", "").length).toBe(2);
    expect(filterLines(rows, "all", "astro").map((r) => r.short)).toEqual(["400"]);
    expect(filterLines(rows, "kapnos", "").length).toBe(0);
  });
});
