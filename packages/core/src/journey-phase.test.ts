import { describe, expect, it } from "vitest";

import {
  isRiding,
  isTerminal,
  isWaiting,
  isWalking,
  type JourneyPhase,
} from "./journey-phase";

const ALL: JourneyPhase[] = [
  "idle",
  "arrived",
  "walking-to-stop",
  "walking-to-board",
  "walking-to-transfer",
  "walking-to-dest",
  "walking-to-destination",
  "at-stop",
  "waiting-to-board",
  "waiting-for-connection",
  "hurry-soft",
  "hurry-urgent",
  "boarding",
  "on-bus",
  "riding",
  "alight-soon",
  "missed-bus",
  "missed-connection",
];

describe("journey phase predicates", () => {
  it("recognises both the single-leg and multi-leg walking phases", () => {
    expect(isWalking("walking-to-stop")).toBe(true);
    expect(isWalking("walking-to-board")).toBe(true);
    expect(isWalking("walking-to-transfer")).toBe(true);
    expect(isWalking("walking-to-dest")).toBe(true);
    expect(isWalking("walking-to-destination")).toBe(true);
    expect(isWalking("on-bus")).toBe(false);
  });

  it("recognises the on-board phases", () => {
    expect(isRiding("on-bus")).toBe(true);
    expect(isRiding("riding")).toBe(true);
    expect(isRiding("alight-soon")).toBe(true);
    expect(isRiding("at-stop")).toBe(false);
  });

  it("counts boarding as waiting, not riding", () => {
    expect(isWaiting("boarding")).toBe(true);
    expect(isRiding("boarding")).toBe(false);
  });

  it("treats both hurry levels as waiting at a stop", () => {
    expect(isWaiting("hurry-soft")).toBe(true);
    expect(isWaiting("hurry-urgent")).toBe(true);
  });

  it("marks only the end-of-journey phases terminal", () => {
    expect(isTerminal("arrived")).toBe(true);
    expect(isTerminal("missed-bus")).toBe(true);
    expect(isTerminal("missed-connection")).toBe(true);
    expect(isTerminal("idle")).toBe(false);
    expect(isTerminal("on-bus")).toBe(false);
  });

  it("never puts a phase in two mutually exclusive buckets", () => {
    for (const p of ALL) {
      const hits = [isWalking(p), isRiding(p), isWaiting(p), isTerminal(p)].filter(Boolean);
      expect(hits.length, `phase ${p} is in ${hits.length} buckets`).toBeLessThanOrEqual(1);
    }
  });

  it("leaves only idle unclassified", () => {
    const unclassified = ALL.filter(
      (p) => !isWalking(p) && !isRiding(p) && !isWaiting(p) && !isTerminal(p),
    );
    expect(unclassified).toEqual(["idle"]);
  });
});
