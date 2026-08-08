import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { jccLogin, jccRefresh, jccSync } = await import("../jcc.functions");

function jwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.sig`;
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(text: string, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? false,
    status: init.status ?? 400,
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

describe("jccLogin", () => {
  beforeEach(() => fetchMock.mockReset());

  it("rejects an invalid email at the validator boundary", async () => {
    await expect(
      callServerFn(jccLogin, { email: "not-an-email", password: "secret" }),
    ).rejects.toThrow();
  });

  it("maps a 401 to a wrong-credentials message", async () => {
    fetchMock.mockResolvedValue(textResponse("nope", { ok: false, status: 401 }));
    const out = await callServerFn(jccLogin, { email: "a@b.com", password: "secret" });
    expect(out).toEqual({ ok: false, error: "Wrong email or password." });
  });

  it("surfaces JCC's own message on other failures", async () => {
    fetchMock.mockResolvedValue(
      textResponse(JSON.stringify({ message: "Rate limited\nmore" }), { ok: false, status: 429 }),
    );
    const out = await callServerFn(jccLogin, { email: "a@b.com", password: "secret" });
    expect(out).toEqual({ ok: false, error: "JCC: Rate limited" });
  });

  it("falls back to a generic message when there is no JSON body", async () => {
    fetchMock.mockResolvedValue(textResponse("oops", { ok: false, status: 500 }));
    const out = await callServerFn(jccLogin, { email: "a@b.com", password: "secret" });
    expect(out).toEqual({ ok: false, error: "JCC login failed (500)." });
  });

  it("returns an error when the login response has no tokens", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const out = await callServerFn(jccLogin, { email: "a@b.com", password: "secret" });
    expect(out).toEqual({ ok: false, error: "Login succeeded but no token returned." });
  });

  it("returns tokens and profile on success", async () => {
    const accessToken = jwtWithExp(1893456000);
    fetchMock.mockResolvedValue(
      jsonResponse({
        accessToken,
        refreshToken: "refresh-1",
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
      }),
    );
    const out = await callServerFn(jccLogin, { email: "a@b.com", password: "secret" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.tokens.accessToken).toBe(accessToken);
      expect(out.tokens.expiresAt).toBe(1893456000 * 1000);
      expect(out.profile).toEqual({ firstName: "A", lastName: "B", email: "a@b.com" });
    }
  });

  it("falls back to a default expiry when the JWT is malformed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ accessToken: "not-a-jwt", refreshToken: "r1", email: "a@b.com" }),
    );
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const out = await callServerFn(jccLogin, { email: "a@b.com", password: "secret" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.tokens.expiresAt).toBe(Date.now() + 30 * 60 * 1000);
    }
  });
});

describe("jccRefresh", () => {
  beforeEach(() => fetchMock.mockReset());

  it("rejects a too-short access token", async () => {
    await expect(
      callServerFn(jccRefresh, { accessToken: "short", refreshToken: "0123456789" }),
    ).rejects.toThrow();
  });

  it("returns a session-expired error on failure", async () => {
    fetchMock.mockResolvedValue(textResponse("nope", { ok: false, status: 401 }));
    const out = await callServerFn(jccRefresh, {
      accessToken: "a".repeat(20),
      refreshToken: "b".repeat(20),
    });
    expect(out).toEqual({ ok: false, error: "Session expired." });
  });

  it("returns an error when refresh has no tokens", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const out = await callServerFn(jccRefresh, {
      accessToken: "a".repeat(20),
      refreshToken: "b".repeat(20),
    });
    expect(out).toEqual({ ok: false, error: "Refresh returned no token." });
  });

  it("returns new tokens on success", async () => {
    const accessToken = jwtWithExp(1893456000);
    fetchMock.mockResolvedValue(jsonResponse({ accessToken, refreshToken: "r2" }));
    const out = await callServerFn(jccRefresh, {
      accessToken: "a".repeat(20),
      refreshToken: "b".repeat(20),
    });
    expect(out).toEqual({
      ok: true,
      tokens: { accessToken, refreshToken: "r2", expiresAt: 1893456000 * 1000 },
    });
  });
});

describe("jccSync", () => {
  beforeEach(() => fetchMock.mockReset());

  it("rejects a malformed card UID", async () => {
    await expect(
      callServerFn(jccSync, { accessToken: "a".repeat(20), cardUid: "abc" }),
    ).rejects.toThrow();
  });

  it("reports an expired session on 401", async () => {
    fetchMock.mockResolvedValue(textResponse("nope", { ok: false, status: 401 }));
    const out = await callServerFn(jccSync, { accessToken: "a".repeat(20), cardUid: "1234567890" });
    expect(out).toEqual({ ok: false, code: "expired" });
  });

  it("reports a card error for a wrong cardUID", async () => {
    fetchMock.mockResolvedValue(textResponse("Wrong cardUID provided", { ok: false, status: 400 }));
    const out = await callServerFn(jccSync, { accessToken: "a".repeat(20), cardUid: "1234567890" });
    expect(out).toEqual({
      ok: false,
      code: "card",
      error: "JCC doesn't recognize this card number. Double-check the 10–16 digits on the back.",
    });
  });

  it("surfaces JCC's message for other 400 errors", async () => {
    fetchMock.mockResolvedValue(
      textResponse(JSON.stringify({ message: "Card blocked" }), { ok: false, status: 400 }),
    );
    const out = await callServerFn(jccSync, { accessToken: "a".repeat(20), cardUid: "1234567890" });
    expect(out).toEqual({ ok: false, code: "card", error: "JCC: Card blocked" });
  });

  it("reports a generic http error for other failures", async () => {
    fetchMock.mockResolvedValue(textResponse("server error", { ok: false, status: 500 }));
    const out = await callServerFn(jccSync, { accessToken: "a".repeat(20), cardUid: "1234567890" });
    expect(out).toEqual({ ok: false, code: "http", error: "JCC sync failed (500)." });
  });

  it("maps and sorts transactions, deriving balance from the latest", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          date: "2024-01-01T00:00:00Z",
          price: 1.5,
          stopName: "Stop A",
          type: "Topup",
          typeName: "Top up",
          fields: [
            { name: "Balance", type: "number", value: 10 },
            { name: "Route", type: "string", value: "30" },
            { name: "Name", type: "string", value: "Motion" },
          ],
        },
        {
          date: "2024-01-02T00:00:00Z",
          price: 0.5,
          stopName: "Stop B",
          type: "EntryValidation",
          typeName: "Entry",
          fields: [{ name: "Balance", type: "number", value: 9.5 }],
        },
      ]),
    );
    vi.setSystemTime(new Date("2024-01-03T00:00:00Z"));
    const out = await callServerFn(jccSync, { accessToken: "a".repeat(20), cardUid: "1234567890" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.transactions).toHaveLength(2);
      expect(out.transactions[0].stopName).toBe("Stop B");
      expect(out.balanceEur).toBe(9.5);
      expect(out.syncedAt).toBe(Date.now());
    }
  });

  it("returns a zero balance when there are no transactions", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const out = await callServerFn(jccSync, { accessToken: "a".repeat(20), cardUid: "1234567890" });
    expect(out).toEqual(
      expect.objectContaining({ ok: true, balanceEur: 0, passName: "", transactions: [] }),
    );
  });
});
