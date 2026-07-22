import { describe, expect, it } from "vitest";
import { briefingDateLabel, greekMotif } from "./greek-word-motif";

describe("greekMotif", () => {
  it("maps known words to their motif", () => {
    expect(greekMotif("Καλημέρα")).toBe("greeting");
    expect(greekMotif("Λεωφορείο")).toBe("transit");
    expect(greekMotif("Χαλλούμι")).toBe("food");
    expect(greekMotif("Παραλία")).toBe("place");
    expect(greekMotif("Ευχαριστώ")).toBe("courtesy");
  });

  it("tolerates whitespace and trailing punctuation from the dictionary", () => {
    expect(greekMotif("  Καλημέρα  ")).toBe("greeting");
    expect(greekMotif("Καλημέρα!")).toBe("greeting");
  });

  it("falls back to the olive sprig for unknown or missing words", () => {
    expect(greekMotif("Θάλασσα")).toBe("vibe");
    expect(greekMotif("")).toBe("vibe");
    expect(greekMotif(undefined)).toBe("vibe");
  });
});

describe("briefingDateLabel", () => {
  it("formats an English date", () => {
    expect(briefingDateLabel("2026-08-22", "Saturday", "en")).toBe("Saturday · 22 Aug");
  });

  it("formats a Greek date with Greek month names", () => {
    expect(briefingDateLabel("2026-01-05", "Δευτέρα", "el")).toBe("Δευτέρα · 5 Ιαν");
  });

  it("degrades to the weekday when the date is malformed", () => {
    expect(briefingDateLabel("nonsense", "Friday", "en")).toBe("Friday");
    expect(briefingDateLabel("2026-13-40", "Friday", "en")).toBe("Friday");
  });
});
