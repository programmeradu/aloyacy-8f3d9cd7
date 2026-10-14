// End to end: the code that lands in the email is exactly the code the
// verifier accepts, and it is 8 digits everywhere.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setD1ForTests } from "@/lib/db";
import { createTestD1 } from "@/lib/db/__tests__/sqlite-d1";
import { setWorkerEnv } from "@/lib/worker-env";

vi.mock("@lovable.dev/email-js", () => ({ sendLovableEmail: vi.fn(async () => ({})) }));

const sent: Array<{ subject: string; html: string; text: string }> = [];

beforeEach(() => {
  process.env.JWT_SECRET = "x".repeat(40);
  setD1ForTests(createTestD1());
  sent.length = 0;
  setWorkerEnv({
    JWT_SECRET: process.env.JWT_SECRET,
    SEND_EMAIL: { send: async (m: { subject: string; html: string; text: string }) => void sent.push(m) },
  });
});

describe("email OTP (8 digits)", () => {
  it("generator always yields exactly 8 digits", async () => {
    const { eightDigits, OTP_LENGTH } = await import("@/lib/auth/session.server");
    expect(OTP_LENGTH).toBe(8);
    for (let i = 0; i < 500; i++) expect(eightDigits()).toMatch(/^\d{8}$/);
  });

  it("the emailed code verifies and upgrades the guest user in place", async () => {
    const { sendAuthOtpEmail } = await import("@/lib/auth-email.server");
    const { createUser, verifyOtp } = await import("@/lib/auth/session.server");
    const guest = await createUser();
    expect(guest.is_anonymous).toBe(true);

    const res = await sendAuthOtpEmail("Rider@Example.com");
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
    const fromSubject = /(\d+)\s*$/.exec(sent[0]!.subject)?.[1];
    expect(fromSubject).toMatch(/^\d{8}$/);
    expect(sent[0]!.html).toContain(fromSubject);
    expect(sent[0]!.text).toContain(fromSubject);
    expect(sent[0]!.html).toContain("8-digit");

    const wrong = await verifyOtp("rider@example.com", "00000000" === fromSubject ? "11111111" : "00000000", guest.id);
    expect(wrong.ok).toBe(false);
    const ok = await verifyOtp("rider@example.com", fromSubject!, guest.id);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.session.user.id).toBe(guest.id);
      expect(ok.session.user.email).toBe("rider@example.com");
    }
  });

  it("verify route accepts only 8-digit codes", async () => {
    const { Route } = await import("@/routes/api/public/auth/verify");
    const post = (Route as any).options.server.handlers.POST as (a: { request: Request }) => Promise<Response>;
    const call = (token: string) =>
      post({
        request: new Request("https://app.aloya.cy/api/public/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "a@b.cy", token }),
        }),
      });
    for (const bad of ["123456", "1234567", "123456789", "abcdefgh"]) {
      const r = await call(bad);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("Enter the 8-digit code.");
    }
    const r = await call("12345678");
    expect(r.status).toBe(400); // well-formed but no code issued
    expect((await r.json()).error).not.toBe("Enter the 8-digit code.");
  }, 60_000);
});
