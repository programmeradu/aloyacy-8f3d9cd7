import { describe, expect, it } from "vitest";
import { GROUP_STALE_MS, formatEta, initials, isStale, timeAgo } from "./group-format";

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("initials", () => {
  it("takes at most two initials", () => {
    expect(initials("Andreas Georgiou")).toBe("AG");
    expect(initials("maria elena petrou")).toBe("ME");
    expect(initials("Kyriakos")).toBe("K");
  });

  it("falls back to a neutral mark for empty names", () => {
    expect(initials("   ")).toBe("·");
  });
});

describe("formatEta", () => {
  it("handles missing and invalid values", () => {
    expect(formatEta(null)).toBe("—");
    expect(formatEta(undefined)).toBe("—");
    expect(formatEta(Number.NaN)).toBe("—");
  });

  it("says Arriving at or past zero", () => {
    expect(formatEta(0)).toBe("Arriving");
    expect(formatEta(-3)).toBe("Arriving");
  });

  it("formats minutes and hours", () => {
    expect(formatEta(12.4)).toBe("12 min");
    expect(formatEta(59)).toBe("59 min");
    expect(formatEta(60)).toBe("1 h");
    expect(formatEta(80)).toBe("1 h 20");
  });
});

describe("timeAgo", () => {
  it("reports missing or unparseable timestamps", () => {
    expect(timeAgo(null, NOW)).toBe("no location yet");
    expect(timeAgo("not-a-date", NOW)).toBe("no location yet");
  });

  it("phrases recent, minute and hour ranges", () => {
    expect(timeAgo(ago(10_000), NOW)).toBe("just now");
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe("5 min ago");
    expect(timeAgo(ago(2 * 3_600_000), NOW)).toBe("2 h ago");
  });

  it("never goes negative for clock skew", () => {
    expect(timeAgo(new Date(NOW + 30_000).toISOString(), NOW)).toBe("just now");
  });
});

describe("isStale", () => {
  it("treats missing or invalid timestamps as stale", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale("nope", NOW)).toBe(true);
  });

  it("uses the shared stale window", () => {
    expect(isStale(ago(GROUP_STALE_MS - 1_000), NOW)).toBe(false);
    expect(isStale(ago(GROUP_STALE_MS + 1_000), NOW)).toBe(true);
  });

  it("accepts a custom window", () => {
    expect(isStale(ago(20_000), NOW, 10_000)).toBe(true);
    expect(isStale(ago(20_000), NOW, 30_000)).toBe(false);
  });
});
