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

  const Template = isNewUser ? SignupEmail : MagicLinkEmail;
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

  try {
    await sendLovableEmail(
      {
        run_id: messageId,
        to: email,
        from: `${SITE_NAME} <noreply@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: isNewUser ? "Confirm your email" : "Your Aloya sign-in code",
        html,
        text,
        purpose: "transactional",
        label: isNewUser ? "signup" : "magiclink",
        message_id: messageId,
      } as Parameters<typeof sendLovableEmail>[0],
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : "Could not send the code.";
    console.error("[auth-email] send failed", { email: redact(email), error });
    void supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: isNewUser ? "signup" : "magiclink",
      recipient_email: email,
      status: "failed",
      error_message: error,
    });
    return { ok: false, error, code: "send_failed" };
  }

  void supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: isNewUser ? "signup" : "magiclink",
    recipient_email: email,
    status: "sent",
  });

  return { ok: true };
}
