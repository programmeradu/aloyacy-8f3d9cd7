import { describe, expect, it } from "vitest";
import { stopIndexable } from "./stop-index";

describe("stopIndexable", () => {
  it("stays closed on a name and a timetable", () => {
    expect(
      stopIndexable({ ratedReliability: false, skipSpeaks: false, confirmedAttribute: false }),
    ).toBe(false);
  });

  it("opens when any one fact is real", () => {
    expect(
      stopIndexable({ ratedReliability: true, skipSpeaks: false, confirmedAttribute: false }),
    ).toBe(true);
    expect(
      stopIndexable({ ratedReliability: false, skipSpeaks: true, confirmedAttribute: false }),
    ).toBe(true);
    expect(
      stopIndexable({ ratedReliability: false, skipSpeaks: false, confirmedAttribute: true }),
    ).toBe(true);
  });
});
