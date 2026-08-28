import { describe, expect, it } from "vitest";
import { stop as stopEn } from "./dictionaries/en/stop";
import {
  ASK_FIRST,
  CONSENSUS_MIN,
  CONSENSUS_TTL_DAYS,
  PHOTO_REPORT_WEIGHT,
  STOP_ATTRIBUTE_VALUES,
  STOP_CONDITION_SEED,
  daysSince,
  isStopAttributeValue,
  lastReportPerDevice,
  nextStopAsk,
  pickStopConsensus,
  riderConfirmLine,
  seedConsensus,
  weighReports,
  stopAskChoiceLabel,
  stopAskChoices,
  stopConditionAsk,
  stopConditionChip,
  type StopConsensus,
  type StopReport,
} from "./stop-condition";

function report(over: Partial<StopReport> & Pick<StopReport, "deviceId" | "value">): StopReport {
  return {
    stopId: "1009",
    attribute: "has_shelter",
    reportedAt: 1_000,
    ...over,
  };
}

describe("seed", () => {
  it("names the eight curated hubs and does not invent a fare", () => {
    expect(STOP_CONDITION_SEED.map((r) => r.stopId)).toEqual([
      "1009",
      "1001",
      "2030",
      "3050",
      "2050",
      "intercity-larnaca-airport",
      "intercity-paphos",
      "intercity-limassol-oldport",
    ]);
    const chips = seedConsensus(STOP_CONDITION_SEED[0]!).map((r) =>
      stopConditionChip(r.attribute, r.value),
    );
    expect(chips).toEqual(["Shelter", "Seating", "Step-free"]);
    expect(chips.join(" ")).not.toMatch(/€|taxi|RAPTOR|Green Line|luggage/i);
  });
});

describe("pickStopConsensus", () => {
  const now = 10_000;

  it("stays silent on one rider when there is no seed", () => {
    expect(CONSENSUS_MIN).toBe(2);
    expect(pickStopConsensus([report({ deviceId: "a", value: "yes" })], null, now)).toBeNull();
  });

  it("keeps the seed until two devices agree", () => {
    const seed = { value: "yes", source: "seed" as const };
    expect(pickStopConsensus([report({ deviceId: "a", value: "no" })], seed, now)).toEqual({
      value: "yes",
      n: 1,
      source: "seed",
      lastAt: 1_000,
    });
    expect(
      pickStopConsensus(
        [report({ deviceId: "a", value: "no" }), report({ deviceId: "b", value: "no" })],
        seed,
        now,
      ),
    ).toEqual({ value: "no", n: 2, source: "riders", lastAt: 1_000 });
  });

  it("uses the latest report per device, and holds the previous on a tie", () => {
    const latest = lastReportPerDevice([
      report({ deviceId: "a", value: "yes", reportedAt: 1 }),
      report({ deviceId: "a", value: "no", reportedAt: 2 }),
      report({ deviceId: "b", value: "yes", reportedAt: 3 }),
    ]);
    expect(latest).toHaveLength(2);
    expect(latest.find((r) => r.deviceId === "a")?.value).toBe("no");
    expect(
      pickStopConsensus(
        [report({ deviceId: "a", value: "yes" }), report({ deviceId: "b", value: "no" })],
        { value: "yes", source: "seed" },
        now,
      ),
    ).toEqual({ value: "yes", n: 2, source: "seed", lastAt: 1_000 });
  });

  it("drops reports older than 90 days and does not hold expired rider consensus", () => {
    expect(CONSENSUS_TTL_DAYS).toBe(90);
    const stale = 91 * 86_400_000;
    const seed = { value: "yes", source: "seed" as const };
    expect(
      pickStopConsensus(
        [
          report({ deviceId: "a", value: "no", reportedAt: 1 }),
          report({ deviceId: "b", value: "no", reportedAt: 2 }),
        ],
        seed,
        stale,
      ),
    ).toEqual({ value: "yes", n: 0, source: "seed", lastAt: null });
    expect(
      pickStopConsensus(
        [
          report({ deviceId: "a", value: "no", reportedAt: 1 }),
          report({ deviceId: "b", value: "no", reportedAt: 2 }),
        ],
        { value: "no", source: "riders" },
        stale,
      ),
    ).toBeNull();
  });

  it("lets a photo break a tap-vs-tap tie without dropping the two-phone bar", () => {
    expect(PHOTO_REPORT_WEIGHT).toBe(2);
    const seed = { value: "yes", source: "seed" as const };
    const taps = [
      report({ deviceId: "a", value: "no" }),
      report({ deviceId: "b", value: "yes" }),
    ];
    expect(pickStopConsensus(taps, seed, now)).toEqual({
      value: "yes",
      n: 2,
      source: "seed",
      lastAt: 1_000,
    });
    expect(pickStopConsensus(weighReports(taps, new Set(["a"])), seed, now)).toEqual({
      value: "no",
      n: 2,
      source: "riders",
      lastAt: 1_000,
    });
    expect(
      pickStopConsensus(
        weighReports([report({ deviceId: "a", value: "no" })], new Set(["a"])),
        seed,
        now,
      ),
    ).toEqual({ value: "yes", n: 1, source: "seed", lastAt: 1_000 });
  });
});

describe("nextStopAsk", () => {
  it("asks shelter through timetable then two poles, and stops when those are known", () => {
    expect(ASK_FIRST).toEqual([
      "has_shelter",
      "has_seating",
      "reachable_on_foot",
      "lighting",
      "wheelchair_access",
      "has_sign",
      "has_timetable",
      "stop_is_ambiguous",
    ]);
    expect(nextStopAsk([])).toBe("has_shelter");
    const shelter: StopConsensus = {
      stopId: "s",
      attribute: "has_shelter",
      value: "yes",
      n: 0,
      source: "seed",
      lastAt: null,
    };
    const seating = { ...shelter, attribute: "has_seating" as const, value: "no" };
    const walk = { ...shelter, attribute: "reachable_on_foot" as const, value: "no_crossing" };
    const light = { ...shelter, attribute: "lighting" as const, value: "none" };
    const step = { ...shelter, attribute: "wheelchair_access" as const, value: "partial" };
    const sign = { ...shelter, attribute: "has_sign" as const, value: "wrong" };
    expect(nextStopAsk([shelter])).toBe("has_seating");
    expect(nextStopAsk([shelter, seating])).toBe("reachable_on_foot");
    expect(nextStopAsk([shelter, seating, walk])).toBe("lighting");
    expect(nextStopAsk([shelter, seating, walk, light])).toBe("wheelchair_access");
    expect(nextStopAsk([shelter, seating, walk, light, step])).toBe("has_sign");
    expect(nextStopAsk([shelter, seating, walk, light, step, sign])).toBe("has_timetable");
    const timetable = { ...shelter, attribute: "has_timetable" as const, value: "no" };
    expect(nextStopAsk([shelter, seating, walk, light, step, sign, timetable])).toBe(
      "stop_is_ambiguous",
    );
    expect(
      nextStopAsk([
        shelter,
        seating,
        walk,
        light,
        step,
        sign,
        timetable,
        { ...shelter, attribute: "stop_is_ambiguous", value: "yes" },
      ]),
    ).toBeNull();
  });
});

describe("copy", () => {
  it("names two poles only when the stop is ambiguous, and rejects unknown values", () => {
    expect(stopConditionAsk("stop_is_ambiguous")).toBe("Two poles here?");
    expect(stopConditionChip("stop_is_ambiguous", "yes")).toBe("Two poles");
    expect(stopConditionChip("stop_is_ambiguous", "no")).toBeNull();
    expect(stopAskChoices("stop_is_ambiguous")).toEqual(STOP_ATTRIBUTE_VALUES.stop_is_ambiguous);
    expect(stopEn["stop.cond.askAmbiguous"]).toBe("Two poles here?");
    expect(stopEn["stop.cond.ambiguousYes"]).toBe("Two poles");
    expect(isStopAttributeValue("stop_is_ambiguous", "yes")).toBe(true);
    expect(isStopAttributeValue("stop_is_ambiguous", "maybe")).toBe(false);
    expect(["Two poles", "Two poles here?"].join(" ")).not.toMatch(
      /€|taxi|RAPTOR|Green Line|luggage/i,
    );
  });

  it("says confirmed by n riders, last 12 days ago", () => {
    expect(daysSince(1, 12 * 86_400_000 + 1)).toBe(12);
    expect(riderConfirmLine(4, 12)).toBe("Confirmed by 4 riders, last 12 days ago");
    expect(riderConfirmLine(4, 0)).toBe("Confirmed by 4 riders");
    expect(riderConfirmLine(4, 1)).toBe("Confirmed by 4 riders, last 1 day ago");
    expect(stopEn["stop.cond.confirmedAgo"]).toBe(
      "Confirmed by {n} riders, last {days} days ago",
    );
    expect(riderConfirmLine(4, 12)).not.toMatch(/€|taxi|RAPTOR|Green Line|luggage/i);
  });
});
