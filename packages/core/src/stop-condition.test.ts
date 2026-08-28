import { describe, expect, it } from "vitest";
import { stop as stopEn } from "./dictionaries/en/stop";
import {
  ASK_FIRST,
  CONSENSUS_MIN,
  STOP_ATTRIBUTE_VALUES,
  STOP_CONDITION_SEED,
  isStopAttributeValue,
  lastReportPerDevice,
  nextStopAsk,
  pickStopConsensus,
  seedConsensus,
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
  it("stays silent on one rider when there is no seed", () => {
    expect(CONSENSUS_MIN).toBe(2);
    expect(pickStopConsensus([report({ deviceId: "a", value: "yes" })], null)).toBeNull();
  });

  it("keeps the seed until two devices agree", () => {
    const seed = { value: "yes", source: "seed" as const };
    expect(pickStopConsensus([report({ deviceId: "a", value: "no" })], seed)).toEqual({
      value: "yes",
      n: 1,
      source: "seed",
    });
    expect(
      pickStopConsensus(
        [report({ deviceId: "a", value: "no" }), report({ deviceId: "b", value: "no" })],
        seed,
      ),
    ).toEqual({ value: "no", n: 2, source: "riders" });
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
      ),
    ).toEqual({ value: "yes", n: 2, source: "seed" });
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
});
