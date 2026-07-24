import { describe, expect, it } from "vitest";
import { applyLiveEta, buildCompanionMarkers, feedBannerVariant } from "./companion-view";

const walkIn = { from: { lat: 35.1, lng: 33.3 }, to: { lat: 35.11, lng: 33.31 } };
const walkOut = { from: { lat: 35.2, lng: 33.4 }, to: { lat: 35.21, lng: 33.41 } };

const base = {
  walkIn,
  walkOut,
  originLabel: "Home",
  destLabel: "Office",
  boardName: "Solomou",
  alightName: "Eleftheria",
};

describe("buildCompanionMarkers", () => {
  it("shows origin and boarding stop while walking to the stop", () => {
    const m = buildCompanionMarkers({ ...base, walkingPhase: "to-stop" });
    expect(m.map((x) => x.kind)).toEqual(["origin", "stop"]);
    expect(m[0].label).toBe("Home");
    expect(m[1]).toMatchObject({ lat: 35.11, lng: 33.31, label: "Solomou" });
  });

  it("shows alighting stop and destination on the final walk", () => {
    const m = buildCompanionMarkers({ ...base, walkingPhase: "to-dest" });
    expect(m.map((x) => x.kind)).toEqual(["stop", "destination"]);
    expect(m[1].label).toBe("Office");
  });

  it("falls back to a both-stops overview when not walking", () => {
    const m = buildCompanionMarkers({ ...base, walkingPhase: null });
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ kind: "stop", label: "Solomou" });
    expect(m[1]).toMatchObject({ kind: "destination", label: "Eleftheria" });
  });

  it("skips ends that are not walk legs and falls back to the overview", () => {
    expect(buildCompanionMarkers({ ...base, walkingPhase: null, walkIn: null })).toHaveLength(1);
    const noAccessWalk = buildCompanionMarkers({ ...base, walkingPhase: "to-stop", walkIn: null });
    expect(noAccessWalk).toEqual([
      { lat: 35.2, lng: 33.4, kind: "destination", label: "Eleftheria" },
    ]);
  });
});

describe("applyLiveEta", () => {
  const counts = { minToBoard: 9, minToAlight: 20, minToDoor: 25 };

  it("keeps schedule numbers when the tracker is off", () => {
    expect(applyLiveEta(counts, { phase: "walking", walkOutSec: 300, live: null })).toEqual(counts);
    expect(
      applyLiveEta(counts, {
        phase: "walking",
        walkOutSec: 300,
        live: { active: false, secsToBoard: 60, fusedSecsToAlight: 60 },
      }),
    ).toEqual(counts);
  });

  it("uses the GPS board estimate while walking or waiting", () => {
    const out = applyLiveEta(counts, {
      phase: "walking",
      walkOutSec: 300,
      live: { active: true, secsToBoard: 250, fusedSecsToAlight: 0 },
    });
    expect(out.minToBoard).toBe(4);
    expect(out.minToAlight).toBe(20);
  });

  it("never renders a negative board countdown", () => {
    const out = applyLiveEta(counts, {
      phase: "waiting",
      walkOutSec: 0,
      live: { active: true, secsToBoard: 5, fusedSecsToAlight: 0 },
    });
    expect(out.minToBoard).toBe(0);
  });

  it("fuses alight and door ETAs once on board", () => {
    const out = applyLiveEta(counts, {
      phase: "on-bus",
      walkOutSec: 300,
      live: { active: true, secsToBoard: 0, fusedSecsToAlight: 600 },
    });
    expect(out).toEqual({ minToBoard: 9, minToAlight: 10, minToDoor: 15 });
  });

  it("ignores board estimates in the wrong phase", () => {
    const out = applyLiveEta(counts, {
      phase: "on-bus",
      walkOutSec: 300,
      live: { active: true, secsToBoard: 30, fusedSecsToAlight: 0 },
    });
    expect(out).toEqual(counts);
  });
});

describe("feedBannerVariant", () => {
  it("is silent when tracking is off", () => {
    expect(feedBannerVariant({ active: false, feedStale: true })).toBeNull();
  });

  it("prefers a ghost trip over a stale feed", () => {
    expect(feedBannerVariant({ active: true, tripGhost: true, feedStale: true })).toBe("ghost-bus");
  });

  it("reports a stale feed", () => {
    expect(feedBannerVariant({ active: true, feedStale: true })).toBe("feed-stale");
  });

  it("reports a lost vehicle only when the feed itself is fine", () => {
    expect(feedBannerVariant({ active: true, vehicleLost: true })).toBe("vehicle-lost");
    expect(feedBannerVariant({ active: true, vehicleLost: true, feedStale: true })).toBe(
      "feed-stale",
    );
  });

  it("falls back to an untracked next bus", () => {
    expect(feedBannerVariant({ active: true, vehicleNotTracked: true })).toBe("next-not-tracked");
    expect(feedBannerVariant({ active: true })).toBeNull();
  });
});
