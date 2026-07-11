import { describe, expect, it } from "vitest";
import {
  deriveSchedulePhase,
  delayCopy,
  phaseHeadline,
  phaseLabel,
  phaseSubcopy,
  resolveHeroPhase,
  shouldShowAlightAlert,
  walkingPhaseFor,
} from "./single-leg-phase";

const NOW = 1_700_000_000;

function base(over: Partial<Parameters<typeof deriveSchedulePhase>[0]> = {}) {
  return deriveSchedulePhase({
    nowUnix: NOW,
    boardUnix: NOW + 600,
    alightUnix: NOW + 1500,
    walkInSec: 300,
    walkOutSec: 240,
    ...over,
  });
}

describe("deriveSchedulePhase", () => {
  it("counts the minutes to leave, board, alight and door", () => {
    const r = base();
    expect(r.minToLeave).toBe(5);
    expect(r.minToBoard).toBe(10);
    expect(r.minToAlight).toBe(25);
    expect(r.minToDoor).toBe(29);
  });

  it("tells the rider to get ready while the walk is still ahead", () => {
    expect(base().phase).toBe("leave-soon");
  });

  it("switches to walking once leaving time has passed", () => {
    expect(base({ walkInSec: 60 }).phase).toBe("walking");
  });

  it("waits at the stop in the last minute before departure", () => {
    expect(base({ boardUnix: NOW + 30, walkInSec: 30 }).phase).toBe("waiting");
  });

  it("falls through to on-bus and arrived from the clock alone", () => {
    expect(base({ boardUnix: NOW - 60, walkInSec: 0 }).phase).toBe("on-bus");
    expect(
      base({ boardUnix: NOW - 600, alightUnix: NOW - 300, walkInSec: 0 }).phase,
    ).toBe("arrived");
  });

  it("keeps a started rider walking until the access walk is nearly done", () => {
    expect(base({ startedAtUnix: NOW - 60 }).phase).toBe("walking");
    expect(base({ startedAtUnix: NOW - 280 }).phase).toBe("waiting");
  });

  it("honours an on-board confirmation over the timetable", () => {
    expect(base({ onBoard: true }).phase).toBe("on-bus");
    expect(base({ onBoard: true, alightUnix: NOW + 60 }).phase).toBe("alight-soon");
    expect(base({ onBoard: true, alightUnix: NOW - 300 }).phase).toBe("arrived");
  });

  it("treats an alighted rider with walk left as almost there", () => {
    expect(base({ alighted: true, alightUnix: NOW - 60 }).phase).toBe("alight-soon");
    expect(
      base({ alighted: true, alightUnix: NOW - 600, walkOutSec: 60 }).phase,
    ).toBe("arrived");
  });
});

describe("resolveHeroPhase", () => {
  it("keeps the schedule phase when tracking is off or idle", () => {
    expect(resolveHeroPhase("waiting", null)).toBe("waiting");
    expect(resolveHeroPhase("waiting", { active: false, phase: "on-bus" })).toBe("waiting");
    expect(resolveHeroPhase("waiting", { active: true, phase: "idle" })).toBe("waiting");
  });

  it("prefers GPS truth when the tracker is live", () => {
    expect(resolveHeroPhase("leave-soon", { active: true, phase: "hurry-urgent" })).toBe("walking");
    expect(resolveHeroPhase("on-bus", { active: true, phase: "walking-to-dest" })).toBe("arrived");
  });
});

describe("walkingPhaseFor", () => {
  it("routes the rider to the stop before boarding and to the door after", () => {
    expect(walkingPhaseFor("leave-soon", false)).toBe("to-stop");
    expect(walkingPhaseFor("waiting", false)).toBe("to-stop");
    expect(walkingPhaseFor("alight-soon", false)).toBe("to-dest");
    expect(walkingPhaseFor("on-bus", false)).toBeNull();
  });

  it("always walks to the destination once alighted", () => {
    expect(walkingPhaseFor("on-bus", true)).toBe("to-dest");
  });
});

describe("copy", () => {
  it("ignores sub-minute delay noise", () => {
    expect(delayCopy(0)).toBe("on time");
    expect(delayCopy(45)).toBe("on time");
    expect(delayCopy(-45)).toBe("on time");
    expect(delayCopy(300)).toBe("5 min late");
    expect(delayCopy(-180)).toBe("3 min early");
  });

  it("labels every phase", () => {
    expect(phaseLabel("leave-soon")).toBe("Get ready");
    expect(phaseLabel("arrived")).toBe("Arrived");
  });

  it("never prints a negative countdown", () => {
    const h = phaseHeadline({
      phase: "leave-soon",
      minToLeave: -4,
      minToBoard: 0,
      minToAlight: 0,
      minToDoor: 0,
      boardName: "Solomou",
      alightName: "Eleftheria",
    });
    expect(h.big).toBe("Leave in 0 min");
    expect(h.small).toContain("Solomou");
  });

  it("names the alight stop when stepping off next", () => {
    const h = phaseHeadline({
      phase: "alight-soon",
      minToLeave: 0,
      minToBoard: 0,
      minToAlight: 1,
      minToDoor: 4,
      boardName: "Solomou",
      alightName: "Eleftheria",
    });
    expect(h).toEqual({ big: "Step off next", small: "Eleftheria." });
  });

  it("writes subcopy with rounded walk minutes", () => {
    const text = phaseSubcopy({
      phase: "on-bus",
      walkInSec: 300,
      walkOutSec: 250,
      destName: "Home",
      boardName: "Solomou",
      alightName: "Eleftheria",
      minToDoor: 9,
    });
    expect(text).toBe("Sit back. 4 min walk after Eleftheria.");
  });

  it("congratulates on arrival", () => {
    expect(
      phaseSubcopy({
        phase: "arrived",
        walkInSec: 0,
        walkOutSec: 0,
        destName: "Home",
        boardName: "A",
        alightName: "B",
        minToDoor: -2,
      }),
    ).toBe("0 min to Home. Nice one.");
  });
});

describe("shouldShowAlightAlert", () => {
  it("shows in the alight window and the last few on-bus minutes", () => {
    expect(shouldShowAlightAlert("alight-soon", 99)).toBe(true);
    expect(shouldShowAlightAlert("on-bus", 3)).toBe(true);
    expect(shouldShowAlightAlert("on-bus", 4)).toBe(false);
    expect(shouldShowAlightAlert("waiting", 0)).toBe(false);
  });
});
