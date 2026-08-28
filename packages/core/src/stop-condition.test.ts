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
  it("asks shelter, seating, walk, light, step-free, then sign, and stops when those are known", () => {
    expect(ASK_FIRST).toEqual([
      "has_shelter",
      "has_seating",
      "reachable_on_foot",
      "lighting",
      "wheelchair_access",
      "has_sign",
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
    expect(nextStopAsk([shelter])).toBe("has_seating");
    expect(nextStopAsk([shelter, seating])).toBe("reachable_on_foot");
    expect(nextStopAsk([shelter, seating, walk])).toBe("lighting");
    expect(nextStopAsk([shelter, seating, walk, light])).toBe("wheelchair_access");
    expect(nextStopAsk([shelter, seating, walk, light, step])).toBe("has_sign");
    expect(
      nextStopAsk([
        shelter,
        seating,
        walk,
        light,
        step,
        { ...shelter, attribute: "has_sign", value: "wrong" },
      ]),
    ).toBeNull();
  });
});

describe("copy", () => {
  it("names shelter, seating, walk, light, step-free and sign, and rejects unknown values", () => {
    expect(stopConditionAsk("has_sign")).toBe("A sign here?");
    expect(stopConditionChip("has_sign", "yes")).toBe("Sign");
    expect(stopConditionChip("has_sign", "no")).toBe("No sign");
    expect(stopConditionChip("has_sign", "wrong")).toBe("Wrong sign");
    expect(stopAskChoices("has_sign")).toEqual(STOP_ATTRIBUTE_VALUES.has_sign);
    expect(stopAskChoiceLabel("wrong")).toBe("Wrong");
    expect(stopEn["stop.cond.askSign"]).toBe("A sign here?");
    expect(stopEn["stop.cond.signWrong"]).toBe("Wrong sign");
    expect(isStopAttributeValue("has_sign", "wrong")).toBe(true);
    expect(isStopAttributeValue("has_sign", "maybe")).toBe(false);
    expect(["Sign", "No sign", "Wrong sign", "A sign here?"].join(" ")).not.toMatch(
      /€|taxi|RAPTOR|Green Line|luggage/i,
    );
  });
});
