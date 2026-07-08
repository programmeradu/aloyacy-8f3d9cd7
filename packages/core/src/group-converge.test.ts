import { describe, expect, it } from "vitest";
import { memberStatusLine, summariseConverge } from "./group-converge";

describe("summariseConverge", () => {
  it("returns null when nobody has an ETA", () => {
    expect(summariseConverge([])).toBeNull();
    expect(summariseConverge([null, undefined])).toBeNull();
  });

  it("reads a tight group as arriving together", () => {
    const s = summariseConverge([8, 9, 10])!;
    expect(s.allTogether).toBe(true);
    expect(s.first).toBe(8);
    expect(s.last).toBe(10);
    expect(s.headline).toBe("Everyone in ~8 min.");
    expect(s.detail).toContain("Spread of 2 min");
  });

  it("calls out a wide spread with both ends", () => {
    const s = summariseConverge([4, 25])!;
    expect(s.allTogether).toBe(false);
    expect(s.headline).toBe("First in 4 min · last in 25 min");
    expect(s.detail).toContain("21 min gap");
  });

  it("says everyone's here at zero", () => {
    const s = summariseConverge([0, 0])!;
    expect(s.headline).toBe("Everyone's here.");
    expect(s.detail).toContain("Same minute");
  });

  it("ignores non-numeric entries", () => {
    const s = summariseConverge([null, 12, undefined, Number.NaN])!;
    expect(s.first).toBe(12);
    expect(s.last).toBe(12);
  });
});

describe("memberStatusLine", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  const at = (secAgo: number) => new Date(now - secAgo * 1000).toISOString();

  it("reports an ETA with fresh timing", () => {
    const l = memberStatusLine({
      status: "active",
      etaMinutes: 12,
      hasFix: true,
      lastUpdated: at(20),
      now,
    });
    expect(l.primary).toBe("12 min away");
    expect(l.freshness).toBe("updated 20s ago");
    expect(l.stale).toBe(false);
  });

  it("switches to reconnecting past the stale window", () => {
    const l = memberStatusLine({
      status: "active",
      etaMinutes: 12,
      hasFix: true,
      lastUpdated: at(600),
      now,
    });
    expect(l.stale).toBe(true);
    expect(l.freshness).toBe("reconnecting");
  });

  it("distinguishes moving from never-moved", () => {
    expect(memberStatusLine({ status: "active", hasFix: true, now }).primary).toBe("En route");
    expect(memberStatusLine({ status: "active", hasFix: false, now }).primary).toBe(
      "Not yet moving",
    );
  });

  it("says arriving now at or below zero minutes", () => {
    expect(memberStatusLine({ status: "active", etaMinutes: 0, hasFix: true, now }).primary).toBe(
      "Arriving now",
    );
  });

  it("suppresses freshness for members who left", () => {
    const l = memberStatusLine({ status: "left", hasFix: true, lastUpdated: at(10), now });
    expect(l).toEqual({ primary: "Left the group", freshness: null, stale: false, left: true });
  });

  it("rounds minutes to whole numbers", () => {
    expect(memberStatusLine({ status: "active", etaMinutes: 7.6, hasFix: true, now }).primary).toBe(
      "8 min away",
    );
  });

  it("uses minute phrasing past a minute old", () => {
    const l = memberStatusLine({
      status: "active",
      hasFix: true,
      lastUpdated: at(70),
      now,
      staleMs: 600_000,
    });
    expect(l.freshness).toBe("updated 1m ago");
  });
});
