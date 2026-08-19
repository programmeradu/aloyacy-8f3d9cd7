import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { verifyMotionCard, getMotionCardOptions } = await import("../publictransport.functions");

describe("verifyMotionCard", () => {
  beforeEach(() => fetchMock.mockReset());

  it("rejects a malformed card number", async () => {
    await expect(callServerFn(verifyMotionCard, { cardNumber: "abc" })).rejects.toThrow();
  });

  it("returns an error when the upstream responds non-ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const out = await callServerFn(verifyMotionCard, { cardNumber: "123456" });
    expect(out).toEqual({ ok: false, error: "Lookup failed (500)." });
  });

  it("returns an error when the card isn't recognized", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { result: "FAIL" } }),
    });
    const out = await callServerFn(verifyMotionCard, { cardNumber: "123456" });
    expect(out).toEqual({ ok: false, error: "Card not recognized." });
  });

  it("returns an error when success is false", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, result: { result: "OK", balance: 5 } }),
    });
    const out = await callServerFn(verifyMotionCard, { cardNumber: "123456" });
    expect(out.ok).toBe(false);
  });

  it("returns the balance for a valid card", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: { result: "OK", balance: 12.5, cardType: "Motion" },
      }),
    });
    const out = await callServerFn(verifyMotionCard, { cardNumber: "123456" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.balanceEur).toBe(12.5);
      expect(out.cardType).toBe("Motion");
    }
  });

  it("defaults cardType to null when absent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { result: "OK", balance: 0 } }),
    });
    const out = await callServerFn(verifyMotionCard, { cardNumber: "123456" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.cardType).toBeNull();
  });
});

describe("getMotionCardOptions", () => {
  beforeEach(() => fetchMock.mockReset());

  it("rejects a malformed card number", async () => {
    await expect(callServerFn(getMotionCardOptions, { cardNumber: "x" })).rejects.toThrow();
  });

  it("returns an error when the upstream responds non-ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const out = await callServerFn(getMotionCardOptions, { cardNumber: "123456" });
    expect(out).toEqual({ ok: false, error: "Lookup failed (404)." });
  });

  it("returns an error when the card has no top-up options", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { result: "FAIL" } }),
    });
    const out = await callServerFn(getMotionCardOptions, { cardNumber: "123456" });
    expect(out).toEqual({ ok: false, error: "No top-up options for this card." });
  });

  it("flattens and returns passes, skipping entries without a topUpList", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          result: "OK",
          balance: 3,
          cptPassList: [
            [
              { code: "P1" },
              { companyCode: "CY" },
              { name: "Weekly Pass" },
              { topUpList: { code: "P1", name: "Weekly Pass", price: "10", validityPeriods: "7" } },
            ],
            // entry missing topUpList entirely -> should be skipped
            [{ code: "P2" }, { name: "No topup" }],
          ],
        },
      }),
    });
    const out = await callServerFn(getMotionCardOptions, { cardNumber: "123456" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.balanceEur).toBe(3);
      expect(out.passes).toHaveLength(1);
      expect(out.passes[0]).toEqual({
        code: "P1",
        name: "Weekly Pass",
        priceEur: 10,
        validityDays: 7,
        companyCode: "CY",
      });
    }
  });

  it("returns null validityDays when validityPeriods is missing or non-numeric", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          result: "OK",
          balance: 0,
          cptPassList: [[{ topUpList: { code: "P3", name: "Odd", price: "5" } }]],
        },
      }),
    });
    const out = await callServerFn(getMotionCardOptions, { cardNumber: "123456" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.passes[0]?.validityDays).toBeNull();
  });

  it("returns an empty passes array when cptPassList is absent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { result: "OK", balance: 1 } }),
    });
    const out = await callServerFn(getMotionCardOptions, { cardNumber: "123456" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.passes).toEqual([]);
  });
});
