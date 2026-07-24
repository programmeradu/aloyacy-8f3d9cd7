import { describe, expect, it } from "vitest";
import {
  formatShareDay,
  formatShareDuration,
  formatShareTime,
  hashString,
  pickPlanBackdrop,
  pickStopBackdrop,
  wrapText,
} from "./share-card-copy";

describe("hashString", () => {
  it("is stable and unsigned", () => {
    expect(hashString("stop-1")).toBe(hashString("stop-1"));
    expect(hashString("stop-1")).toBeGreaterThanOrEqual(0);
    expect(hashString("stop-1")).not.toBe(hashString("stop-2"));
  });
});

describe("pickStopBackdrop", () => {
  const stop = (name: string, id = "x", agency = "NIC") => ({ id, name, agency });

  it("reads mountain villages", () => {
    expect(pickStopBackdrop(stop("Kakopetria Square"))).toBe("mountain");
  });

  it("reads seafronts and harbours", () => {
    expect(pickStopBackdrop(stop("Phinikoudes"))).toBe("coastDusk");
    expect(pickStopBackdrop(stop("Kato Paphos Harbour"))).toBe("harborNight");
  });

  it("reads the coastal corridor and the old town", () => {
    expect(pickStopBackdrop(stop("Limassol Marina Road"))).toBe("coastDusk");
    expect(pickStopBackdrop(stop("Ayia Napa Centre"))).toBe("coastRoad");
    expect(pickStopBackdrop(stop("Ledra Street"))).toBe("oldtown");
  });

  it("sends unmatched intercity stops to the coast road", () => {
    expect(pickStopBackdrop(stop("Depot 4", "s9", "IC"))).toBe("coastRoad");
  });

  it("is deterministic for unmatched urban stops", () => {
    const a = pickStopBackdrop(stop("Unnamed Shelter", "s42"));
    expect(pickStopBackdrop(stop("Unnamed Shelter", "s42"))).toBe(a);
    expect(["urbanMorning", "oldtown"]).toContain(a);
  });
});

describe("pickPlanBackdrop", () => {
  it("keys on the destination", () => {
    expect(pickPlanBackdrop("Troodos")).toBe("mountain");
    expect(pickPlanBackdrop("Larnaca Airport")).toBe("coastDusk");
    expect(pickPlanBackdrop("Nicosia old town")).toBe("oldtown");
  });

  it("falls back deterministically", () => {
    expect(pickPlanBackdrop("Somewhere else")).toBe(pickPlanBackdrop("Somewhere else"));
  });
});

describe("time formatting", () => {
  // 2026-08-22T09:05:00Z → 12:05 in Cyprus (UTC+3 in August).
  const unix = Date.UTC(2026, 7, 22, 9, 5) / 1000;

  it("renders Cyprus wall-clock time in 24h", () => {
    expect(formatShareTime(unix, "en")).toBe("12:05");
    expect(formatShareTime(unix, "el")).toBe("12:05");
  });

  it("renders an uppercase day stamp", () => {
    expect(formatShareDay(unix, "en")).toMatch(/22/);
    expect(formatShareDay(unix, "en")).toBe(formatShareDay(unix, "en").toUpperCase());
  });

  it("keeps late-evening trips on the right Cyprus day", () => {
    // 22:30 UTC is already the next day in Nicosia.
    const late = Date.UTC(2026, 7, 22, 22, 30) / 1000;
    expect(formatShareDay(late, "en")).toMatch(/23/);
  });
});

describe("formatShareDuration", () => {
  it("never rounds down to zero", () => {
    expect(formatShareDuration(20, "en")).toBe("1 min");
  });

  it("uses minutes under the hour", () => {
    expect(formatShareDuration(35 * 60, "en")).toBe("35 min");
    expect(formatShareDuration(35 * 60, "el")).toBe("35 λεπτά");
  });

  it("splits hours and minutes", () => {
    expect(formatShareDuration(80 * 60, "en")).toBe("1h 20m");
    expect(formatShareDuration(120 * 60, "en")).toBe("2h");
    expect(formatShareDuration(80 * 60, "el")).toBe("1ώ 20λ");
  });
});

describe("wrapText", () => {
  // One unit per character keeps the expectations readable.
  const measure = (s: string) => s.length;

  it("wraps on word boundaries", () => {
    expect(wrapText("alpha beta gamma delta", 11, 4, measure)).toEqual([
      "alpha beta",
      "gamma delta",
    ]);
  });

  it("keeps a short headline on one line", () => {
    expect(wrapText("Ledra Street", 40, 2, measure)).toEqual(["Ledra Street"]);
  });

  it("ellipsizes the last line when it overflows", () => {
    const lines = wrapText("Extraordinarilylongstopname here", 10, 1, measure);
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith("…")).toBe(true);
    expect(measure(lines[0])).toBeLessThanOrEqual(10);
  });

  it("respects the line budget", () => {
    expect(wrapText("a b c d e f g h i j k", 3, 2, measure)).toHaveLength(2);
  });

  it("handles empty and whitespace-only input", () => {
    expect(wrapText("", 10, 2, measure)).toEqual([]);
    expect(wrapText("   ", 10, 2, measure)).toEqual([]);
  });
});
