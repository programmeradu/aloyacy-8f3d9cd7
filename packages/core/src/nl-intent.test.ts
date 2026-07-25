import { describe, expect, it } from "vitest";
import {
  describeWhen,
  extractClockTime,
  extractHeuristicIntent,
  isActionableIntent,
  isSelfReference,
  mergeIntents,
  sliceOriginal,
} from "./nl-intent";

// Fixed clock: 2026-08-22T09:00:00Z, tz = Cyprus summer (UTC+3 → 180 min).
const NOW = Date.parse("2026-08-22T09:00:00Z");
const TZ = 180;

describe("sliceOriginal", () => {
  it("recovers the original casing", () => {
    expect(sliceOriginal("to Eleftheria Square", "eleftheria square")).toBe("Eleftheria Square");
  });
  it("falls back to the fragment when absent", () => {
    expect(sliceOriginal("abc", "zzz")).toBe("zzz");
  });
});

describe("extractHeuristicIntent", () => {
  it("parses 'to X'", () => {
    const i = extractHeuristicIntent("to Eleftheria Square", TZ, NOW);
    expect(i.to).toBe("Eleftheria Square");
    expect(i.from).toBeNull();
    expect(i.confidence).toBe(0.7);
  });

  it("parses 'from A to B'", () => {
    const i = extractHeuristicIntent("from Larnaca Port to Nicosia Mall", TZ, NOW);
    expect(i.from).toBe("Larnaca Port");
    expect(i.to).toBe("Nicosia Mall");
  });

  it("parses relative minutes into a leave time", () => {
    const i = extractHeuristicIntent("to the airport in 20 min", TZ, NOW);
    expect(i.to).toBe("the airport");
    expect(i.leaveByISO).toBe(new Date(NOW + 20 * 60_000).toISOString());
    expect(i.confidence).toBe(0.95);
  });

  it("parses 'X in N min' without a 'to'", () => {
    const i = extractHeuristicIntent("Eleftheria Square in 15 minutes", TZ, NOW);
    expect(i.to).toBe("Eleftheria Square");
  });

  it("treats 'arrive by' as an arrival anchor", () => {
    const i = extractHeuristicIntent("to Limassol arrive by 4pm", TZ, NOW);
    expect(i.arriveByISO).not.toBeNull();
    expect(i.leaveByISO).toBeNull();
    // 16:00 local (UTC+3) => 13:00Z the same day
    expect(i.arriveByISO).toBe("2026-08-22T13:00:00.000Z");
  });

  it("anchors 'tomorrow 7am' to the next local day", () => {
    const i = extractHeuristicIntent("to Larnaca airport tomorrow 7am", TZ, NOW);
    expect(i.leaveByISO).toBe("2026-08-23T04:00:00.000Z");
  });

  it("returns zero confidence with no destination", () => {
    const i = extractHeuristicIntent("hello there", TZ, NOW);
    expect(i.to).toBeNull();
    expect(i.confidence).toBe(0);
    expect(isActionableIntent(i)).toBe(false);
  });
});

describe("extractClockTime", () => {
  it("skips times already past today", () => {
    // 09:00Z == 12:00 local; "at 10am" local is in the past.
    expect(extractClockTime("to town at 10am", TZ, NOW)).toBeNull();
  });

  it("ignores bare small numbers that are not times", () => {
    expect(extractClockTime("to platform 3", TZ, NOW)).toBeNull();
  });

  it("pushes 'tonight' hours into the evening", () => {
    const r = extractClockTime("to paphos tonight at 9", TZ, NOW);
    expect(r?.iso).toBe("2026-08-22T18:00:00.000Z");
  });
});

describe("mergeIntents", () => {
  const heuristic = extractHeuristicIntent("to Limassol in 10 min", TZ, NOW);

  it("prefers AI place names but heuristic times", () => {
    const merged = mergeIntents(
      { from: "Nicosia", to: "Limassol Marina", leaveByISO: "2026-01-01T00:00:00.000Z", confidence: 0.8 },
      heuristic,
    );
    expect(merged.to).toBe("Limassol Marina");
    expect(merged.from).toBe("Nicosia");
    expect(merged.leaveByISO).toBe(heuristic.leaveByISO);
    expect(merged.confidence).toBe(0.95);
  });

  it("survives a null AI result", () => {
    expect(mergeIntents(null, heuristic)).toEqual(heuristic);
    expect(isActionableIntent(mergeIntents(null, heuristic))).toBe(true);
  });
});

describe("isSelfReference", () => {
  it("treats missing origins as self", () => {
    expect(isSelfReference(null)).toBe(true);
    expect(isSelfReference("")).toBe(true);
  });
  it("matches known phrases case-insensitively", () => {
    expect(isSelfReference("  My Location ")).toBe(true);
    expect(isSelfReference("Larnaca")).toBe(false);
  });
});

describe("describeWhen", () => {
  it("labels today, tomorrow and other days", () => {
    expect(describeWhen("2026-08-22T13:00:00Z", "en-US", NOW).kind).toBe("today");
    expect(describeWhen("2026-08-23T13:00:00Z", "en-US", NOW).kind).toBe("tomorrow");
    const later = describeWhen("2026-08-28T13:00:00Z", "en-US", NOW);
    expect(later.kind).toBe("dow");
    if (later.kind === "dow") expect(later.dow.length).toBeGreaterThan(0);
  });

  it("falls back on an invalid timestamp", () => {
    expect(describeWhen("not-a-date", "en-US", NOW)).toEqual({ kind: "raw", time: "not-a-date" });
  });
});
