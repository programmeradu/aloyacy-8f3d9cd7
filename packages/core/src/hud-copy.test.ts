import { describe, it, expect } from "vitest";
import {
  fmtMin,
  fmtDist,
  hudVisibility,
  hurryCopy,
  hurryHeadline,
  boardingBody,
  ridingBody,
  alightEtaSec,
  maneuverLabel,
  activeStepIndex,
  countdownTick,
} from "./hud-copy";

describe("formatters", () => {
  it("formats durations", () => {
    expect(fmtMin(20)).toBe("under a minute");
    expect(fmtMin(60)).toBe("1 min");
    expect(fmtMin(725)).toBe("12 min");
    expect(fmtMin(-90)).toBe("under a minute");
    expect(fmtMin(Number.NaN)).toBe("-");
  });

  it("formats distances", () => {
    expect(fmtDist(180.4)).toBe("180 m");
    expect(fmtDist(1400)).toBe("1.4 km");
    expect(fmtDist(-1)).toBe("-");
    expect(fmtDist(Number.POSITIVE_INFINITY)).toBe("-");
  });
});

describe("hudVisibility", () => {
  it("shows only the start card when tracking is off", () => {
    const v = hudVisibility({ active: false, phase: "walking-to-stop", hasSteps: true });
    expect(v.start).toBe(true);
    expect(v.step).toBe(false);
  });

  it("pairs the hurry banner with the step card", () => {
    const v = hudVisibility({ active: true, phase: "hurry-urgent", hasSteps: true });
    expect(v).toMatchObject({ hurry: true, step: true, start: false });
  });

  it("hides the step card without steps", () => {
    expect(hudVisibility({ active: true, phase: "walking-to-dest", hasSteps: false }).step).toBe(
      false,
    );
  });

  it("maps the remaining phases one-to-one", () => {
    const at = (phase: string) => hudVisibility({ active: true, phase, hasSteps: true });
    expect(at("at-stop").atStop).toBe(true);
    expect(at("boarding").boarding).toBe(true);
    expect(at("missed-bus").missed).toBe(true);
    expect(at("on-bus").riding).toBe(true);
    expect(at("alight-soon").riding).toBe(true);
    expect(at("arrived").arrived).toBe(true);
    expect(at("arrived").riding).toBe(false);
  });
});

describe("copy", () => {
  it("switches hurry tone on urgency", () => {
    expect(hurryCopy(true).kicker).toBe("Hurry, bus is here");
    expect(hurryCopy(false).kicker).toBe("Pace up");
    expect(hurryCopy(false).body).toContain("pace");
  });

  it("builds the hurry headline", () => {
    expect(hurryHeadline(120, 240)).toBe("Bus in 2 min · walk 4 min");
  });

  it("builds boarding body copy", () => {
    expect(boardingBody({ onBoardSuggested: true, secondsLeft: 12.4, alightName: "X" })).toBe(
      "Looks like you're on board, auto-confirming in 12s.",
    );
    expect(
      boardingBody({ onBoardSuggested: false, secondsLeft: 30, alightName: "Finikoudes" }),
    ).toContain("press-stop at Finikoudes");
  });

  it("explains a lost vehicle feed", () => {
    expect(ridingBody(true)).toContain("lost the operator feed");
    expect(ridingBody(false)).toContain("Sit back");
  });
});

describe("numbers", () => {
  it("prefers the fused alight eta", () => {
    expect(alightEtaSec(300, 480)).toBe(300);
    expect(alightEtaSec(0, 480)).toBe(480);
    expect(alightEtaSec(0, -5)).toBe(0);
  });

  it("labels maneuvers", () => {
    expect(maneuverLabel("turn-left")).toBe("turn left");
    expect(maneuverLabel("")).toBe("straight");
    expect(maneuverLabel(null)).toBe("straight");
  });

  it("clamps the active step index", () => {
    expect(activeStepIndex(5, 3)).toBe(2);
    expect(activeStepIndex(-2, 3)).toBe(0);
    expect(activeStepIndex(1, 0)).toBe(0);
  });

  it("ticks the auto-confirm countdown", () => {
    expect(countdownTick(30)).toEqual({ next: 29, confirm: false });
    expect(countdownTick(1)).toEqual({ next: 0, confirm: true });
    expect(countdownTick(0)).toEqual({ next: 0, confirm: true });
  });
});
