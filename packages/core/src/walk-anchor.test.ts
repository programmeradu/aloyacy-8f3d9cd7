import { describe, expect, it } from "vitest";
import { resolveWalkAnchor, WALK_ANCHOR, type WalkAnchor } from "./walk-anchor";

const planned = { lat: 35.17, lng: 33.35 };
/** Offset in metres, roughly, along longitude at this latitude. */
const east = (m: number) => ({ lat: 35.17, lng: 33.35 + m / 91_000 });

describe("resolveWalkAnchor", () => {
  it("uses the planned stop while the rider is still on the bus", () => {
    const a = resolveWalkAnchor({
      planned,
      fix: east(900),
      previous: null,
      useLive: false,
    });
    expect(a).toEqual({ ...planned, live: false });
  });

  it("falls back to the plan with no fix at all", () => {
    const a = resolveWalkAnchor({ planned, fix: null, previous: null, useLive: true });
    expect(a?.live).toBe(false);
  });

  it("returns null when there is nothing to anchor to", () => {
    expect(resolveWalkAnchor({ planned: null, fix: null, previous: null, useLive: true })).toBeNull();
  });

  it("anchors to the rider once they are off at a different stop", () => {
    const off = east(400);
    const a = resolveWalkAnchor({ planned, fix: off, previous: null, useLive: true });
    expect(a).toMatchObject({ live: true, lat: off.lat });
    expect(a?.lng).toBeCloseTo(off.lng, 6);
  });

  it("keeps the planned point when the rider got off right where planned", () => {
    const a = resolveWalkAnchor({
      planned,
      fix: east(WALK_ANCHOR.SNAP_TO_PLANNED_M - 15),
      previous: null,
      useLive: true,
    });
    expect(a?.live).toBe(false);
  });

  it("does not chase GPS jitter", () => {
    const previous: WalkAnchor = { ...east(400), live: true };
    const jittered = resolveWalkAnchor({
      planned,
      fix: east(420),
      previous,
      useLive: true,
    });
    expect(jittered).toBe(previous);
  });

  it("follows the rider once they have genuinely walked on", () => {
    const previous: WalkAnchor = { ...east(400), live: true };
    const moved = resolveWalkAnchor({
      planned,
      fix: east(400 + WALK_ANCHOR.HYSTERESIS_M + 30),
      previous,
      useLive: true,
    });
    expect(moved).not.toBe(previous);
    expect(moved?.live).toBe(true);
  });

  it("ignores a hopelessly vague fix rather than teleporting the line", () => {
    const previous: WalkAnchor = { ...east(400), live: true };
    const a = resolveWalkAnchor({
      planned,
      fix: { ...east(2000), accuracyM: 300 },
      previous,
      useLive: true,
    });
    expect(a).toBe(previous);
  });
});
