import { describe, expect, it } from "vitest";
import { analyseRpcFunctions } from "../scripts/input-validation-report.mjs";

describe("RPC Input Validation Integrity", () => {
  it("verifies every internal server RPC function in src/lib/*.functions.ts has a validated input schema", () => {
    const results = analyseRpcFunctions();

    expect(results.length).toBeGreaterThan(50);

    const gaps = results.filter((r) => r.status === "GAP");
    const failureReport = gaps.map((g) => `Missing input validation: ${g.file} -> ${g.fnName}`).join("\n");

    expect(gaps, failureReport).toEqual([]);
  });

  it("ensures each RPC declares a validator or schema", () => {
    const results = analyseRpcFunctions();
    for (const r of results) {
      expect(
        r.hasValidatorCall || r.schemas.length > 0,
        `Expected RPC function ${r.file}:${r.fnName} to have an input validator or Zod schema`,
      ).toBe(true);
    }
  });
});
