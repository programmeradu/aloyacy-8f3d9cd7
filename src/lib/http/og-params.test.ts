import { describe, expect, it } from "vitest";
import { safeGroupCode, safePlanToken } from "./og-params";

describe("safeGroupCode", () => {
  it("normalises a real code to upper case", () => {
    expect(safeGroupCode("ab12cd")).toBe("AB12CD");
    expect(safeGroupCode("  QWER ")).toBe("QWER");
  });

  it("rejects codes that are too short, too long or non-alphanumeric", () => {
    expect(safeGroupCode("AB1")).toBeNull();
    expect(safeGroupCode("A".repeat(13))).toBeNull();
    expect(safeGroupCode("AB-12")).toBeNull();
    expect(safeGroupCode("' OR 1=1 --")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(safeGroupCode(undefined)).toBeNull();
    expect(safeGroupCode(null)).toBeNull();
    expect(safeGroupCode(42)).toBeNull();
  });
});

describe("safePlanToken", () => {
  it("accepts URL-safe opaque tokens", () => {
    expect(safePlanToken("abc123_-XYZ")).toBe("abc123_-XYZ");
    expect(safePlanToken(" abcdef ")).toBe("abcdef");
    expect(safePlanToken("a".repeat(64))).toHaveLength(64);
  });

  it("rejects tokens outside the allowed shape", () => {
    expect(safePlanToken("short")).toBeNull();
    expect(safePlanToken("a".repeat(65))).toBeNull();
    expect(safePlanToken("has spaces")).toBeNull();
    expect(safePlanToken("../../etc/passwd")).toBeNull();
    expect(safePlanToken({})).toBeNull();
  });
});
