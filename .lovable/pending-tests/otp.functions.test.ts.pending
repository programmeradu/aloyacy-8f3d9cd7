import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const authState: { claims: unknown; error: unknown } = { claims: null, error: null };
const dbState: { tables: Record<string, TableResult> } = { tables: {} };
const updateUserById = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const { client } = makeSupabaseMock(dbState.tables);
    return {
      ...client,
      auth: {
        getClaims: vi.fn(async () =>
          authState.error
            ? { data: null, error: authState.error }
            : { data: { claims: authState.claims }, error: null },
        ),
      },
    };
  }),
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock(dbState.tables);
  return {
    supabaseAdmin: {
      ...client,
      auth: { admin: { updateUserById: (...args: unknown[]) => updateUserById(...args) } },
    },
  };
});

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
    vi.stubEnv("CUSTOM_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("CUSTOM_SUPABASE_ANON_KEY", "anon-key");
    vi.setSystemTime(new Date("2024-01-02T00:00:00Z"));
    authState.claims = { sub: "user-1", is_anonymous: true };
    authState.error = null;
    updateUserById.mockReset();
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
    updateUserById.mockResolvedValue({ error: null });
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    await callServerFn(linkEmailAndRequestOtp, { email: "link1@example.com" }, auth());
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link1@example.com" }, auth());
    expect(out).toEqual(expect.objectContaining({ ok: true, throttled: true }));
  });

  it("reports email_taken when the email is already registered", async () => {
    updateUserById.mockResolvedValue({
      error: { message: "Email address already registered", code: "email_exists", status: 422 },
    });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link2@example.com" }, auth());
    expect(out).toEqual({ ok: false, code: "email_taken", error: "Email is already in use." });
  });

  it("returns update_failed for other update errors", async () => {
    updateUserById.mockResolvedValue({ error: { message: "db down" } });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link3@example.com" }, auth());
    expect(out).toEqual({ ok: false, code: "update_failed", error: "db down" });
  });

  it("returns otp_failed when sending the code fails after linking", async () => {
    updateUserById.mockResolvedValue({ error: null });
    sendAuthOtpEmail.mockResolvedValue({ ok: false, error: "smtp down" });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link4@example.com" }, auth());
    expect(out).toEqual({ ok: false, code: "otp_failed", error: "smtp down" });
  });

  it("links the email and sends the code on the happy path", async () => {
    updateUserById.mockResolvedValue({ error: null });
    sendAuthOtpEmail.mockResolvedValue({ ok: true });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link5@example.com" }, auth());
    expect(out).toEqual({ ok: true, throttled: false });
    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      email: "link5@example.com",
      email_confirm: true,
    });
  });

  it("returns send_failed when an unexpected error is thrown", async () => {
    updateUserById.mockImplementation(() => {
      throw new Error("kaboom");
    });
    const out = await callServerFn(linkEmailAndRequestOtp, { email: "link6@example.com" }, auth());
    expect(out).toEqual({ ok: false, code: "send_failed", error: "kaboom" });
  });
});
