import { describe, it, expect, vi, afterEach } from "vitest";
import { jccLogin, jccRefresh, jccSync, verifyMotionCard, getMotionCardOptions } from "../walletApi";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(json: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => json });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("walletApi", () => {
  it("jccLogin posts the login action and returns the parsed body", async () => {
    const fn = mockFetch({ ok: true, tokens: { accessToken: "a", refreshToken: "b", expiresAt: 1 }, profile: { firstName: "F", lastName: "L", email: "e" } });
    const res = await jccLogin("a@b.com", "pw");
    expect(res.ok).toBe(true);
    const [, init] = fn.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ action: "login", email: "a@b.com", password: "pw" });
  });

  it("jccRefresh posts the refresh action", async () => {
    mockFetch({ ok: false, error: "expired" });
    const res = await jccRefresh("acc", "ref");
    expect(res.ok).toBe(false);
  });

  it("jccSync defaults period to Last30 and forwards a custom period", async () => {
    const fn = mockFetch({ ok: false, code: "expired" });
    await jccSync("acc", "card1");
    expect(JSON.parse(fn.mock.calls[0][1].body)).toMatchObject({ period: "Last30" });
    await jccSync("acc", "card1", "Today");
    expect(JSON.parse(fn.mock.calls[1][1].body)).toMatchObject({ period: "Today" });
  });

  it("verifyMotionCard and getMotionCardOptions post the right actions", async () => {
    const fn = mockFetch({ ok: true, balanceEur: 5, cardType: null, syncedAt: 1 });
    await verifyMotionCard("1234");
    expect(JSON.parse(fn.mock.calls[0][1].body)).toMatchObject({ action: "verify", cardNumber: "1234" });

    const fn2 = mockFetch({ ok: true, balanceEur: 5, passes: [], syncedAt: 1 });
    await getMotionCardOptions("1234");
    expect(JSON.parse(fn2.mock.calls[0][1].body)).toMatchObject({ action: "options", cardNumber: "1234" });
  });
});
