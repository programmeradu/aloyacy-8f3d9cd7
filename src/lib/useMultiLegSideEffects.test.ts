import { describe, expect, it } from "vitest";
import { useMultiLegSideEffects } from "./useMultiLegSideEffects";

describe("useMultiLegSideEffects", () => {
  it("exports useMultiLegSideEffects hook function", () => {
    expect(typeof useMultiLegSideEffects).toBe("function");
  });
});
