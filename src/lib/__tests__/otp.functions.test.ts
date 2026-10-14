import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const authState: { claims: unknown } = { claims: null };
const getUserByEmail = vi.fn();

// The middleware verifies the Aloya session token; the test stands in for it.
vi.mock("@/lib/auth/session.server", () => ({
  claimsFromRequest: vi.fn(async (req: Request | undefined) =>
    req?.headers?.get?.("authorization") ? authState.claims : null,
  ),
  getUserByEmail: (...args: unknown[]) => getUserByEmail(...args),
}));

vi.mock("@/lib/db", () => ({ createUserScopedClient: vi.fn(() => ({})) }));

const sendAuthOtpEmail = vi.fn();
vi.mock("@/lib/auth-email.server", () => ({
  sendAuthOtpEmail: (...args: unknown[]) => sendAuthOtpEmail(...args),
}));

const { requestEmailOtp, linkEmailAndRequestOtp } = await import("../otp.functions");

function auth() {
  return { headers: { authorization: "Bearer test-token" } };
}

describe("requestEmailOtp", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    sendAuthOtpEmail.mockReset();
  });

  it("rejects an invalid email at the validator boundary", async () => {
    await expect(callServerFn(requestEmailOtp, { email: "nope" })).rejects.toThrow();
  });

  it("sends the code on the happy path", async () => {
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    const out = await callServerFn(requestEmailOtp, { email: "one@example.com" });
    expect(out).toEqual({ ok: true, throttled: false });
    expect(sendAuthOtpEmail).toHaveBeenCalledWith("one@example.com");
  });

  it("throttles a second request within the interval", async () => {
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    await callServerFn(requestEmailOtp, { email: "two@example.com" });
    const out = await callServerFn(requestEmailOtp, { email: "two@example.com" });
    expect(out).toEqual({
      ok: true,
      throttled: true,
      message: expect.stringContaining("Try again"),
    });
  });

  it("allows a new request after the throttle window passes", async () => {
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    await callServerFn(requestEmailOtp, { email: "three@example.com" });
    vi.setSystemTime(new Date("2024-01-01T00:00:25Z"));
    const out = await callServerFn(requestEmailOtp, { email: "three@example.com" });
    expect(out).toEqual({ ok: true, throttled: false });
  });

  it("returns an error and clears the throttle when sending fails", async () => {
    sendAuthOtpEmail.mockResolvedValue({ ok: false, error: "provider down" });
    const out = await callServerFn(requestEmailOtp, { email: "four@example.com" });
    expect(out).toEqual({ ok: false, error: "provider down" });
    // throttle cleared -> immediate retry is allowed
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    const retry = await callServerFn(requestEmailOtp, { email: "four@example.com" });
    expect(retry).toEqual({ ok: true, throttled: false });
  });
});

describe("linkEmailAndRequestOtp", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2024-01-02T00:00:00Z"));
    authState.claims = { sub: "user-1", is_anonymous: true };
    getUserByEmail.mockReset();
    getUserByEmail.mockResolvedValue(null);
    sendAuthOtpEmail.mockReset();
  });

  it("rejects without auth", async () => {
    await expect(callServerFn(linkEmailAndRequestOtp, { email: "a@b.com" })).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("refuses to link when the caller is not anonymous", async () => {
    authState.claims = { sub: "user-1", is_anonymous: false };
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "a@b.com" }, auth());
    expect(out).toEqual({ ok: false, code: "not_anonymous", error: "Already signed in." });
  });

  it("throttles repeated requests for the same email", async () => {
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    await callServerFn(linkEmailAndRequestOtp, { email: "link1@example.com" }, auth());
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link1@example.com" }, auth());
    expect(out).toEqual(expect.objectContaining({ ok: true, throttled: true }));
  });

  it("reports email_taken when another account owns the email", async () => {
    getUserByEmail.mockResolvedValue({ id: "someone-else", email: "link2@example.com" });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link2@example.com" }, auth());
    expect(out).toEqual({ ok: false, code: "email_taken", error: "Email is already in use." });
    expect(sendAuthOtpEmail).not.toHaveBeenCalled();
  });

  it("returns otp_failed when sending the code fails", async () => {
    sendAuthOtpEmail.mockResolvedValue({ ok: false, error: "smtp down" });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link4@example.com" }, auth());
    expect(out).toEqual({ ok: false, code: "otp_failed", error: "smtp down" });
  });

  it("sends a link code bound to the anonymous user on the happy path", async () => {
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link5@example.com" }, auth());
    expect(out).toEqual({ ok: true, throttled: false });
    expect(sendAuthOtpEmail).toHaveBeenCalledWith("link5@example.com", { linkUserId: "user-1" });
  });

  it("returns send_failed when an unexpected error is thrown", async () => {
    getUserByEmail.mockImplementation(() => {
      throw new Error("kaboom");
    });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link6@example.com" }, auth());
    expect(out).toEqual({ ok: false, code: "send_failed", error: "kaboom" });
  });
});
