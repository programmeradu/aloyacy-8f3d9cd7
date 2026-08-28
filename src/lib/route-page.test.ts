// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { routeHead, fmtRouteClock, useMinutesFromNow } from "./route-page";

describe("routeHead", () => {
  it("noindexes a thin timetable and names the bus", () => {
    const head = routeHead("no-such-route");
    expect(head.meta.find((m) => "title" in m)).toEqual({
      title: "Bus no-such-route — live departures | Aloya",
    });
    expect(head.meta.find((m) => "name" in m && m.name === "robots")).toMatchObject({
      content: "noindex,follow",
    });
    expect(head.scripts).toEqual([]);
  });

  it("indexes only once the clock is rated, and emits breadcrumbs not a trip", () => {
    const open = routeHead("no-such-route", 30);
    expect(open.meta.find((m) => "name" in m && m.name === "robots")).toMatchObject({
      content: "index,follow",
    });
    expect(open.scripts).toHaveLength(1);
    const parsed = JSON.parse(open.scripts[0]!.children) as { "@type": string };
    expect(parsed["@type"]).toBe("BreadcrumbList");
    expect(JSON.stringify(open.scripts)).not.toMatch(/BusTrip|fare|FAQ/i);
    expect(routeHead("no-such-route", 29).scripts).toEqual([]);
  });

  it("includes description referencing the route id when the line is unknown", () => {
    const head = routeHead("no-such-route");
    const desc = head.meta.find((m) => "name" in m && m.name === "description");
    expect((desc as { content?: string } | undefined)?.content).toContain("no-such-route");
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
