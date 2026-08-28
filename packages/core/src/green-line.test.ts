import { describe, expect, it } from "vitest";
import { LEDRA_PEDESTRIAN, matchesGreenLineQuery } from "./green-line";

describe("matchesGreenLineQuery", () => {
  it("hits the names a rider would actually type", () => {
    for (const q of ["green line", "Ledra", "λήδρας", "πράσινη γραμμή", "checkpoint"]) {
      expect(matchesGreenLineQuery(q), q).toBe(true);
    }
  });

  it("stays quiet on short or unrelated queries", () => {
    for (const q of ["", "bus", "green", "led", "30", "solomos"]) {
      expect(matchesGreenLineQuery(q), q).toBe(false);
    }
  });
});

describe("LEDRA_PEDESTRIAN", () => {
  it("pins the Republic-side pedestrian crossing in the old town", () => {
    expect(LEDRA_PEDESTRIAN.lat).toBeGreaterThan(35.17);
    expect(LEDRA_PEDESTRIAN.lat).toBeLessThan(35.18);
    expect(LEDRA_PEDESTRIAN.lng).toBeGreaterThan(33.35);
    expect(LEDRA_PEDESTRIAN.lng).toBeLessThan(33.37);
    expect(LEDRA_PEDESTRIAN.kind).toBe("pedestrian");
  });
});
