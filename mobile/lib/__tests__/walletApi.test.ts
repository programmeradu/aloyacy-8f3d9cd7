import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jccLogin,
  jccRefresh,
  jccSync,
  verifyMotionCard,
  getMotionCardOptions,
  API_BASE,
} from "@/lib/walletApi";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(json: unknown) {
  const fetchMock = vi.fn(async () => ({ json: async () => json }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("wallet API client", () => {
  it("posts a login action to the wallet endpoint with the right payload", async () => {
    const fetchMock = mockFetch({ ok: true, tokens: {}, profile: {} });
    await jccLogin("a@b.com", "secret");
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/public/wallet`,
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toEqual({ action: "login", email: "a@b.com", password: "secret" });
  });

  it("returns the parsed JSON response for login", async () => {
    mockFetch({ ok: true, tokens: { accessToken: "a", refreshToken: "r", expiresAt: 1 }, profile: { firstName: "A", lastName: "B", email: "a@b.com" } });
    const res = await jccLogin("a@b.com", "secret");
    expect(res).toEqual({ ok: true, tokens: { accessToken: "a", refreshToken: "r", expiresAt: 1 }, profile: { firstName: "A", lastName: "B", email: "a@b.com" } });
  });

  it("posts a refresh action with tokens", async () => {
    const fetchMock = mockFetch({ ok: false, error: "expired" });
    const res = await jccRefresh("acc", "ref");
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toEqual({ action: "refresh", accessToken: "acc", refreshToken: "ref" });
    expect(res).toEqual({ ok: false, error: "expired" });
  });

  it("defaults the sync period to Last30 when not supplied", async () => {
    const fetchMock = mockFetch({ ok: true, balanceEur: 1, passName: "p", transactions: [], syncedAt: 1 });
    await jccSync("acc", "card1");
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.period).toBe("Last30");
  });

  it("passes through an explicit sync period", async () => {
    const fetchMock = mockFetch({ ok: true, balanceEur: 1, passName: "p", transactions: [], syncedAt: 1 });
    await jccSync("acc", "card1", "Today");
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.period).toBe("Today");
  });

  it("posts a verify action with just a card number", async () => {
    const fetchMock = mockFetch({ ok: true, balanceEur: 5, cardType: "gold", syncedAt: 1 });
    await verifyMotionCard("999");
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toEqual({ action: "verify", cardNumber: "999" });
  });

  it("posts an options action with just a card number", async () => {
    const fetchMock = mockFetch({ ok: true, balanceEur: 5, passes: [], syncedAt: 1 });
    await getMotionCardOptions("999");
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toEqual({ action: "options", cardNumber: "999" });
  });

  it("sends JSON content-type and accept headers on every call", async () => {
    const fetchMock = mockFetch({ ok: true });
    await verifyMotionCard("1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json",
    });
  });
});
