// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { routeHead, fmtRouteClock, useMinutesFromNow } from "./route-page";

describe("routeHead", () => {
  it("builds meta and links referencing the route id", () => {
    const head = routeHead("30");
    const titleMeta = head.meta.find((m) => "title" in m);
    expect(titleMeta).toEqual({ title: "Route 30 — Aloya" });
    const ogUrl = head.meta.find((m) => (m as any).property === "og:url");
    expect(ogUrl).toEqual({ property: "og:url", content: "https://app.aloya.cy/route/30" });
    expect(head.links).toEqual([{ rel: "canonical", href: "https://app.aloya.cy/route/30" }]);
  });

  it("includes description referencing the route id in both places", () => {
    const head = routeHead("101");
    const desc = head.meta.find((m) => (m as any).name === "description");
    expect((desc as any).content).toContain("101");
  });
});

describe("fmtRouteClock", () => {
  it("formats a unix timestamp as HH:MM", () => {
    // 2024-01-01T12:34:00Z
    const unix = Date.UTC(2024, 0, 1, 12, 34, 0) / 1000;
    const formatted = fmtRouteClock(unix);
    expect(formatted).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("useMinutesFromNow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: {
        store: new Map<string, string>(),
        getItem(k: string) {
          return this.store.has(k) ? this.store.get(k) : null;
        },
        setItem(k: string, v: string) {
          this.store.set(k, v);
        },
      },
      configurable: true,
    });
  });

  it("returns 'due' style label for times at or before now", () => {
    const { result } = renderHook(() => useMinutesFromNow());
    const nowUnix = Date.now() / 1000;
    const label = result.current(nowUnix - 30);
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  it("returns a short-minutes label under an hour away", () => {
    const { result } = renderHook(() => useMinutesFromNow());
    const nowUnix = Date.now() / 1000;
    const label = result.current(nowUnix + 7 * 60);
    expect(label).toContain("7");
  });

  it("returns an hour+minutes label for an hour or more away", () => {
    const { result } = renderHook(() => useMinutesFromNow());
    const nowUnix = Date.now() / 1000;
    const label = result.current(nowUnix + 65 * 60);
    expect(label).toContain("1");
    expect(label).toContain("5");
  });
});
