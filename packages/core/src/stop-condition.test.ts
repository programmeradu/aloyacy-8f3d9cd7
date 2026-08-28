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
  it("asks shelter, seating, walk, then light, and stops when those are known", () => {
    expect(ASK_FIRST).toEqual(["has_shelter", "has_seating", "reachable_on_foot", "lighting"]);
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
    expect(nextStopAsk([shelter])).toBe("has_seating");
    expect(nextStopAsk([shelter, seating])).toBe("reachable_on_foot");
    expect(nextStopAsk([shelter, seating, walk])).toBe("lighting");
    expect(
      nextStopAsk([shelter, seating, walk, { ...shelter, attribute: "lighting", value: "none" }]),
    ).toBeNull();
  });
});

describe("copy", () => {
  it("names shelter, seating, walk and light, and rejects unknown values", () => {
    expect(stopConditionAsk("has_shelter")).toBe("Shelter here?");
    expect(stopConditionAsk("has_seating")).toBe("A seat here?");
    expect(stopConditionAsk("reachable_on_foot")).toBe("Walk here?");
    expect(stopConditionAsk("lighting")).toBe("Light here?");
    expect(stopConditionChip("reachable_on_foot", "yes")).toBe("On foot");
    expect(stopConditionChip("lighting", "good")).toBe("Lit");
    expect(stopConditionChip("lighting", "poor")).toBe("Poor light");
    expect(stopConditionChip("lighting", "none")).toBe("Unlit");
    expect(stopAskChoices("lighting")).toEqual(STOP_ATTRIBUTE_VALUES.lighting);
    expect(stopAskChoiceLabel("none")).toBe("None");
    expect(stopEn["stop.cond.askLight"]).toBe("Light here?");
    expect(stopEn["stop.cond.lightNone"]).toBe("Unlit");
    expect(isStopAttributeValue("lighting", "good")).toBe(true);
    expect(isStopAttributeValue("reachable_on_foot", "no")).toBe(false);
    expect(["Lit", "Poor light", "Unlit", "Light here?"].join(" ")).not.toMatch(
      /€|taxi|RAPTOR|Green Line|luggage/i,
    );
  });
});
