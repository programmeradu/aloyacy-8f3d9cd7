import { describe, expect, it } from "vitest";
import { notchPath } from "./notch";

describe("notchPath", () => {
  it("draws a closed rounded rectangle without notches", () => {
    const d = notchPath(200, 100, 20);
    expect(d.startsWith("M20,0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
  it("adds a concave bottom scoop at the requested centre", () => {
    const d = notchPath(300, 150, 28, [{ edge: "bottom", cx: 150, width: 100, depth: 24 }]);
    expect(d).toContain("150,126");
  });
  it("resolves negative centres from the right edge", () => {
    const d = notchPath(300, 150, 28, [{ edge: "top", cx: -60, width: 80, depth: 20 }]);
    expect(d).toContain("240,20");
  });
  it("returns an empty path for an unmeasured box", () => {
    expect(notchPath(0, 100)).toBe("");
  });
});
