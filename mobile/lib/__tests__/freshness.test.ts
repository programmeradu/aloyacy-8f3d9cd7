import { describe, it, expect } from "vitest";
import * as mobileFreshness from "../freshness";
import * as coreFreshness from "@aloya/core/freshness";

// `mobile/lib/freshness.ts` exists purely so mobile screens never fork the
// trust-layer thresholds. The only thing worth asserting is that it stays a
// faithful re-export — a local redefinition here would silently drift the two
// apps' freshness tiers apart.
describe("mobile freshness re-export", () => {
  it("exposes every export from the shared core module", () => {
    for (const key of Object.keys(coreFreshness)) {
      expect(mobileFreshness).toHaveProperty(key);
      expect((mobileFreshness as Record<string, unknown>)[key]).toBe(
        (coreFreshness as Record<string, unknown>)[key],
      );
    }
  });

  it("adds no mobile-only exports", () => {
    expect(Object.keys(mobileFreshness).sort()).toEqual(Object.keys(coreFreshness).sort());
  });
});
