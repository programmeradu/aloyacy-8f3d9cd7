import { afterEach, describe, expect, it, vi } from "vitest";
import { fullDate, timeAgo } from "@/lib/walletFormat";

afterEach(() => {
  vi.useRealTimers();
});

describe("timeAgo", () => {
  const now = new Date("2026-05-12T12:00:00Z");
  const ago = (ms: number) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return timeAgo(now.getTime() - ms);
  };

  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [60_000, "1 min ago"],
    [59 * 60_000, "59 min ago"],
    [60 * 60_000, "1 h ago"],
    [23 * 3_600_000, "23 h ago"],
    [24 * 3_600_000, "1 d ago"],
    [10 * 86_400_000, "10 d ago"],
  ])("renders %dms ago as %s", (delta, expected) => {
    expect(ago(delta)).toBe(expected);
  });

  it("clamps a future timestamp to just now rather than a negative age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(timeAgo(now.getTime() + 60_000)).toBe("just now");
  });
});

describe("fullDate", () => {
  it("accepts both epoch milliseconds and an ISO string", () => {
    const iso = "2026-05-12T09:05:00Z";
    expect(fullDate(new Date(iso).getTime())).toBe(fullDate(iso));
  });

  it("renders a two-digit day, short month and 24h time", () => {
    expect(fullDate("2026-05-02T09:05:00Z")).toMatch(/^\d{2} \w{3},? \d{2}:\d{2}$/);
  });
});
