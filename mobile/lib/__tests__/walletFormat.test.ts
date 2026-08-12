import { describe, it, expect, vi, afterEach } from "vitest";
import { timeAgo, fullDate } from "../walletFormat";

afterEach(() => vi.useRealTimers());

describe("timeAgo", () => {
  it("covers just now / minutes / hours / days tiers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T00:00:00Z"));
    const now = Date.now();
    expect(timeAgo(now - 5_000)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000)).toBe("5 min ago");
    expect(timeAgo(now - 5 * 3_600_000)).toBe("5 h ago");
    expect(timeAgo(now - 3 * 86_400_000)).toBe("3 d ago");
  });

  it("clamps future timestamps to non-negative", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    expect(timeAgo(Date.now() + 100_000)).toBe("just now");
  });
});

describe("fullDate", () => {
  it("formats numeric and string timestamps", () => {
    expect(fullDate(new Date("2024-03-05T10:30:00Z").getTime())).toContain("Mar");
    expect(fullDate("2024-03-05T10:30:00Z")).toContain("Mar");
  });
});
