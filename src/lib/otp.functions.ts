// Project-specific OTP delivery layer.
//
// This bypasses Lovable Cloud's built-in auth email sender (which requires a
// verified custom domain to customize the template). We use the Supabase
// Admin API to generate the same 6-digit code Supabase would have sent, then
// deliver it ourselves via the Resend connector. The client then verifies it
// with the normal `supabase.auth.verifyOtp({ type: 'email' })` call — Supabase
// has no idea who sent the email, only that the code matches.
//
// IMPORTANT: requires the Resend connector linked to the project. With no
// verified Resend domain, sender falls back to `onboarding@resend.dev` (works
// out of the box for testing and small volumes).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function otpEmailHtml(code: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:20px;padding:40px 32px;border:1px solid #e8e2d4;">
        <tr><td>
          <p style="margin:0 0 28px;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#7a7468;">Aloya</p>
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:500;color:#1c1c1e;font-family:Georgia,'Times New Roman',serif;">Your sign-in code</h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.55;color:#55524b;">Enter this code in the app to finish signing in. It expires in a few minutes and can only be used once.</p>
          <div style="margin:0 0 28px;padding:22px 16px;text-align:center;background:#f6f3ec;border-radius:14px;">
            <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;letter-spacing:0.42em;color:#1c1c1e;">${code}</div>
          </div>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8377;">If you didn't request this, you can safely ignore this email — no account changes were made.</p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:11px;color:#a6a094;">Aloya · Cyprus bus companion</p>
    </td></tr>
  </table>
</body></html>`;
}

async function generateOtp(email: string): Promise<string> {
  // Try magiclink first (works for existing users without touching the password).
  const ml = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (!ml.error && ml.data?.properties?.email_otp) {
    return ml.data.properties.email_otp;
  }

  // User likely doesn't exist yet — create them via the signup link instead.
  const randomPassword =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID() + crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  const su = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email,
    password: randomPassword,
  });
  if (su.error || !su.data?.properties?.email_otp) {
    throw new Error(
      ml.error?.message || su.error?.message || "Could not generate sign-in code.",
    );
  }
  return su.data.properties.email_otp;
}

async function sendViaResend(to: string, code: string): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured.");
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured.");

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: "Aloya <onboarding@resend.dev>",
      to: [to],
      subject: `Your Aloya code is ${code}`,
      html: otpEmailHtml(code),
      text: `Your Aloya sign-in code is ${code}. It expires in a few minutes.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

// Per-email throttle so a hammered button can't drain Resend quota.
const lastSentAt = new Map<string, number>();
const MIN_INTERVAL_MS = 20_000;

export const requestEmailOtp = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email().max(254),
    }).parse,
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const now = Date.now();
    const prev = lastSentAt.get(email) ?? 0;
    if (now - prev < MIN_INTERVAL_MS) {
      const wait = Math.ceil((MIN_INTERVAL_MS - (now - prev)) / 1000);
      return {
        ok: true as const,
        throttled: true as const,
        message: `Code already sent. Try again in ${wait}s.`,
      };
    }
    lastSentAt.set(email, now);

    try {
      const code = await generateOtp(email);
      await sendViaResend(email, code);
      return { ok: true as const, throttled: false as const };
    } catch (err) {
      lastSentAt.delete(email);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Could not send code.",
      };
    }
  });

/**
 * Identity-linking variant of requestEmailOtp. Used when an anonymous
 * Supabase user wants to attach an email without losing their user_id (and
 * the cloud data/Pro entitlement keyed to it).
 *
 * Flow:
 *  1. Middleware confirms the bearer belongs to a real (anon) user.
 *  2. We attach the email to that user via admin.updateUserById with
 *     email_confirm:true so Supabase does NOT send its own confirmation.
 *  3. We generate a magiclink OTP for that email (which now belongs to
 *     the same uid) and deliver it via Resend with our branded template.
 *  4. Client verifies with supabase.auth.verifyOtp({type:'email'}) — the
 *     session stays on the same uid, just now with an email identity.
 *
 * If the email is already in use by another account, we return
 * `code: 'email_taken'` so the client can fall back to the plain
 * `requestEmailOtp` flow (which signs them into the existing account,
 * swapping out the anon session).
 */
export const linkEmailAndRequestOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      email: z.string().email().max(254),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    const userId = context.userId;

    // Refuse to "link" on a permanent account — that path would replace
    // the existing email and lose the original identity.
    const isAnon =
      (context.claims as { is_anonymous?: boolean }).is_anonymous === true;
    if (!isAnon) {
      return { ok: false as const, code: "not_anonymous" as const, error: "Already signed in." };
    }

    const now = Date.now();
    const prev = lastSentAt.get(email) ?? 0;
    if (now - prev < MIN_INTERVAL_MS) {
      const wait = Math.ceil((MIN_INTERVAL_MS - (now - prev)) / 1000);
      return {
        ok: true as const,
        throttled: true as const,
        message: `Code already sent. Try again in ${wait}s.`,
      };
    }
    lastSentAt.set(email, now);

    try {
      // Attach the email to the anon user. email_confirm:true skips
      // Supabase's built-in confirmation email — we deliver our own OTP.
      const upd = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (upd.error) {
        lastSentAt.delete(email);
        const msg = upd.error.message.toLowerCase();
        const errCode = (upd.error as { code?: string }).code ?? "";
        const status = (upd.error as { status?: number }).status ?? 0;
        if (
          errCode === "email_exists" ||
          errCode === "user_already_exists" ||
          status === 422 ||
          msg.includes("already") ||
          msg.includes("registered") ||
          msg.includes("exists") ||
          msg.includes("duplicate") ||
          msg.includes("in use")
        ) {
          return { ok: false as const, code: "email_taken" as const, error: "Email is already in use." };
        }
        return { ok: false as const, code: "update_failed" as const, error: upd.error.message };
      }

      // Now generate a magiclink OTP for the (newly emailed) user.
      const ml = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      const code = ml.data?.properties?.email_otp;
      if (ml.error || !code) {
        lastSentAt.delete(email);
        return { ok: false as const, code: "otp_failed" as const, error: ml.error?.message ?? "Could not generate code." };
      }

      await sendViaResend(email, code);
      return { ok: true as const, throttled: false as const };
    } catch (err) {
      lastSentAt.delete(email);
      return {
        ok: false as const,
        code: "send_failed" as const,
        error: err instanceof Error ? err.message : "Could not send code.",
      };
    }
  });

