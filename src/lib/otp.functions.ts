// Project-specific OTP delivery layer.
//
// Routes through Lovable Emails: we call supabase.auth.signInWithOtp, which
// fires Supabase's auth email hook → our /lovable/email/auth/webhook route,
// which renders the branded React Email templates (signup / magiclink) with
// the 6-digit {{ .Token }} and enqueues them for delivery.
//
// We do NOT call Resend directly here anymore.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicClient() {
  const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

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
      const client = publicClient();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
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

    const isAnon =
      (context.claims as { is_anonymous?: boolean }).is_anonymous === true;
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
      // Attach the email to the anon user. email_confirm:true skips
      // Supabase's built-in confirmation email — we send our own OTP next.
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
          return {
            ok: false as const,
            code: "email_taken" as const,
            error: "Email is already in use.",
          };
        }
        return {
          ok: false as const,
          code: "update_failed" as const,
          error: upd.error.message,
        };
      }

      // Now request OTP via the public client — Supabase fires the
      // auth email hook → branded MagicLinkEmail with the 6-digit token.
      const client = publicClient();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) {
        lastSentAt.delete(email);
        return {
          ok: false as const,
          code: "otp_failed" as const,
          error: error.message,
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
