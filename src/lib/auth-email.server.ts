// Self-hosted delivery of auth one-time codes.
//
// We deliberately do NOT rely on Supabase's built-in email sending or on its
// "send email" auth hook: on this project GoTrue answers /auth/v1/otp with
// `unexpected_failure: Hook requires authorization token`, which surfaced in
// the app as "Error updating user" / "Error sending code".
//
// Instead we mint the one-time code ourselves with the admin API
// (generate_link returns `email_otp` without sending anything), render the
// same branded React Email template the auth webhook would have rendered,
// and hand it straight to the Lovable email sender — no queue hop, so the
// code lands in the inbox immediately instead of on the next cron tick.
//
// verifyOtp({ type: "email" }) on the client accepts these codes unchanged.

import * as React from "react";
import { render } from "@react-email/components";
import { sendLovableEmail } from "@lovable.dev/email-js";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { SignupEmail } from "@/lib/email-templates/signup";

const SITE_NAME = "aloyacy";
const ROOT_DOMAIN = "aloya.cy";
const SENDER_DOMAIN = "notify.aloya.cy";

type SendResult = { ok: true } | { ok: false; error: string; code?: string };

function redact(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

/**
 * Generate a sign-in code for `email` (creating the user if needed) and
 * email it. Returns a plain result object — never throws.
 */
export async function sendAuthOtpEmail(rawEmail: string): Promise<SendResult> {
  const email = rawEmail.trim().toLowerCase();
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending is not configured.", code: "no_api_key" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let isNewUser = false;
  let link = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (link.error) {
    const msg = link.error.message.toLowerCase();
    const missing =
      msg.includes("not found") ||
      msg.includes("signups not allowed") ||
      msg.includes("no user");
    if (!missing) {
      return { ok: false, error: link.error.message, code: "generate_failed" };
    }
    // First-time rider: create the account, then mint the code.
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
    });
    if (created.error) {
      return { ok: false, error: created.error.message, code: "create_failed" };
    }
    isNewUser = true;
    link = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (link.error) {
      return { ok: false, error: link.error.message, code: "generate_failed" };
    }
  }

  const props = link.data.properties as
    | { email_otp?: string; action_link?: string }
    | null;
  const token = props?.email_otp;
  if (!token) {
    return { ok: false, error: "Could not generate a sign-in code.", code: "no_token" };
  }

  const Template = (isNewUser ? SignupEmail : MagicLinkEmail) as unknown as
    React.ComponentType<Record<string, unknown>>;
  const element = React.createElement(Template, {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient: email,
    email,
    token,
    confirmationUrl: props?.action_link,
  } as Record<string, unknown>);

  const html = await render(element);
  const text = await render(element, { plainText: true });
  const messageId = crypto.randomUUID();

  const subject = isNewUser ? "Confirm your email" : "Your Aloya sign-in code";
  const from = `${SITE_NAME} <noreply@${SENDER_DOMAIN}>`;
  const attempts: string[] = [];

  // 1) Resend, when a key is configured. This is the only channel that works
  //    independently of the Lovable platform, which is why it goes first now
  //    that auth lives on our own Supabase project.
  let delivered = false;
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from, to: [email], subject, html, text }),
      });
      if (!res.ok) {
        attempts.push(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      } else {
        delivered = true;
      }
    } catch (err) {
      attempts.push(`resend: ${err instanceof Error ? err.message : "failed"}`);
    }
  } else {
    attempts.push("resend: no RESEND_API_KEY");
  }

  // 2) Lovable's sender as a fallback (works only while the project still has
  //    a platform email run available to it).
  if (!delivered) {
    try {
      await sendLovableEmail(
        {
          to: email,
          from,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: "transactional",
          label: isNewUser ? "signup" : "magiclink",
          message_id: messageId,
          idempotency_key: messageId,
        } as Parameters<typeof sendLovableEmail>[0],
        { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
      );
      delivered = true;
    } catch (err) {
      attempts.push(
        `lovable: ${err instanceof Error ? err.message.slice(0, 200) : "failed"}`,
      );
    }
  }

  if (!delivered) {
    const error = attempts.join(" | ");
    console.error("[auth-email] send failed", { email: redact(email), error });
    void supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: isNewUser ? "signup" : "magiclink",
      recipient_email: email,
      status: "failed",
      error_message: error,
    });
    return {
      ok: false,
      error: "We couldn't send the code right now. Please try again shortly.",
      code: "send_failed",
    };
  }


  void supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: isNewUser ? "signup" : "magiclink",
    recipient_email: email,
    status: "sent",
  });

  return { ok: true };
}
