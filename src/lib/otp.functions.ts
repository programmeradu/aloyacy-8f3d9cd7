// Project-specific OTP delivery layer.
//
// Codes are minted and stored in D1 (src/lib/auth/session.server.ts) and
// delivered by sendAuthOtpEmail (Cloudflare Email / Resend / Lovable sender).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Per-email throttle so a hammered button can't drain quota.
const lastSentAt = new Map<string, number>();
const MIN_INTERVAL_MS = 20_000;

function throttled(email: string) {
  const now = Date.now();
  const prev = lastSentAt.get(email) ?? 0;
  if (now - prev < MIN_INTERVAL_MS) {
    const wait = Math.ceil((MIN_INTERVAL_MS - (now - prev)) / 1000);
    return wait;
  }
  lastSentAt.set(email, now);
  return 0;
}

export const requestEmailOtp = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email().max(254),
    }).parse,
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const wait = throttled(email);
    if (wait > 0) {
      return {
        ok: true as const,
        throttled: true as const,
        message: `Code already sent. Try again in ${wait}s.`,
      };
    }

    try {
      const { sendAuthOtpEmail } = await import("@/lib/auth-email.server");
      const sent = await sendAuthOtpEmail(email);
      if (!sent.ok) throw new Error(sent.error);
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
 * Identity-linking variant: attach an email to the current anonymous user,
 * then send a sign-in OTP via the auth hook (branded template) so they
 * verify it. The session stays on the same uid (preserving Pro/cloud data).
 *
 * Returns `code: 'email_taken'` if another account already owns the email,
 * so the client can fall back to plain requestEmailOtp.
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

    const isAnon = (context.claims as { is_anonymous?: boolean }).is_anonymous === true;
    if (!isAnon) {
      return {
        ok: false as const,
        code: "not_anonymous" as const,
        error: "Already signed in.",
      };
    }

    const wait = throttled(email);
    if (wait > 0) {
      return {
        ok: true as const,
        throttled: true as const,
        message: `Code already sent. Try again in ${wait}s.`,
      };
    }

    try {
      // The email is attached when the code is verified
      // (POST /api/public/auth/verify); here we only refuse taken emails.
      const { getUserByEmail } = await import("@/lib/auth/session.server");
      const owner = await getUserByEmail(email);
      if (owner && owner.id !== userId) {
        lastSentAt.delete(email);
        return {
          ok: false as const,
          code: "email_taken" as const,
          error: "Email is already in use.",
        };
      }

      // Mint + deliver the branded code ourselves (Supabase's own sender is
      // not used — see auth-email.server.ts).
      const { sendAuthOtpEmail } = await import("@/lib/auth-email.server");
      const sent = await sendAuthOtpEmail(email, { linkUserId: userId });
      if (!sent.ok) {
        lastSentAt.delete(email);
        return {
          ok: false as const,
          code: "otp_failed" as const,
          error: sent.error,
        };
      }

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
