import { describe, it, expect } from "vitest";
import { estimateCost, knownModel } from "./bedrock-pricing";

describe("knownModel / estimateCost", () => {
  it("recognises exact model IDs", () => {
    expect(knownModel("anthropic.claude-3-haiku-20240307-v1:0")).toBe(true);
    expect(knownModel("amazon.nova-pro-v1:0")).toBe(true);
  });

  it("returns false and 0 cost for unknown models", () => {
    expect(knownModel("totally.unknown-model")).toBe(false);
    expect(estimateCost("totally.unknown-model", 1000, 1000)).toBe(0);
  });

  it("computes exact-match pricing correctly", () => {
    // claude-3-haiku: input 0.00025, output 0.00125 per 1K tokens
    const cost = estimateCost("anthropic.claude-3-haiku-20240307-v1:0", 2000, 1000);
    expect(cost).toBeCloseTo(2 * 0.00025 + 1 * 0.00125, 10);
  });

  it("falls back to family pricing when exact ID is unknown but matches a pattern", () => {
    const id = "anthropic.claude-sonnet-4-9-20260101-v1:0"; // not exact, matches claude-sonnet family
    expect(knownModel(id)).toBe(true);
    const cost = estimateCost(id, 1000, 1000);
    expect(cost).toBeCloseTo(0.003 + 0.015, 10);
  });

  it("strips ARN prefixes before lookup", () => {
    const arn =
      "arn:aws:bedrock:us-west-2:123456789:inference-profile/us.anthropic.claude-3-haiku-20240307-v1:0";
    expect(knownModel(arn)).toBe(true);
    const cost = estimateCost(arn, 1000, 1000);
    expect(cost).toBeCloseTo(0.00025 + 0.00125, 10);
  });

  it("strips geo prefixes (us./apac./global.) before lookup", () => {
    const us = "us.anthropic.claude-3-haiku-20240307-v1:0";
    const apac = "apac.anthropic.claude-3-haiku-20240307-v1:0";
    const global_ = "global.anthropic.claude-3-haiku-20240307-v1:0";
    expect(knownModel(us)).toBe(true);
    expect(knownModel(apac)).toBe(true);
    expect(knownModel(global_)).toBe(true);
  });

  it("matches llama family fallback by substring", () => {
    expect(knownModel("meta.llama3-1-70b-instruct-v1:0")).toBe(true);
    expect(knownModel("us.meta.llama3-3-70b-instruct-v1:0")).toBe(true);
  });

  it("returns 0 for zero tokens on a known model", () => {
    expect(estimateCost("amazon.nova-micro-v1:0", 0, 0)).toBe(0);
  });

  it("scales linearly with token counts", () => {
    const c1 = estimateCost("amazon.nova-lite-v1:0", 1000, 0);
    const c2 = estimateCost("amazon.nova-lite-v1:0", 2000, 0);
    expect(c2).toBeCloseTo(c1 * 2, 10);
  });
});
