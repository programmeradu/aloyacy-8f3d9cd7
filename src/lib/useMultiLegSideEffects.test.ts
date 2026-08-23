import { describe, expect, it } from "vitest";

describe("useMultiLegSideEffects", () => {
  it("exports useMultiLegSideEffects hook function", async () => {
    const mod = await import("./useMultiLegSideEffects");
    expect(typeof mod.useMultiLegSideEffects).toBe("function");
  });
});
