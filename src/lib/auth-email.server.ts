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
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-email");

const SITE_NAME = "Aloya CY";
const ROOT_DOMAIN = "aloya.cy";
const SENDER_DOMAIN = "notify.aloya.cy";

type SendResult = { ok: true } | { ok: false; error: string; code?: string };

function redact(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

import { getWorkerEnv } from "@/lib/worker-env";

function extractEmailAddress(str: string): string {
  const match = str.match(/<([^>]+)>/);
  return match ? match[1].trim() : str.trim();
}

function buildMimeMessage({
  from,
  to,
  subject,
  text,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(text).toString("base64"),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString("base64"),
    ``,
    `--${boundary}--`,
  ].join("\r\n");
}

async function sendViaCloudflareEmail(
  binding: any,
  options: { from: string; to: string; subject: string; text: string; html: string },
): Promise<{ ok: boolean; error?: string }> {
  const senderAddr = extractEmailAddress(options.from);
  const recipientAddr = extractEmailAddress(options.to);
  const senderName = options.from.includes("<")
    ? options.from.replace(/<[^>]+>/, "").trim() || "Aloya CY"
    : "Aloya CY";

  const attempts: string[] = [];

  // 1. Try structured send with name/email object
  try {
    await binding.send({
      from: { name: senderName, email: senderAddr },
      to: recipientAddr,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return { ok: true };
  } catch (err1: any) {
    attempts.push(`obj: ${err1?.message || String(err1)}`);
  }

  // 2. Try structured send with plain string from
  try {
    await binding.send({
      from: senderAddr,
      to: recipientAddr,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return { ok: true };
  } catch (err2: any) {
    attempts.push(`str: ${err2?.message || String(err2)}`);
  }

  // 3. Try EmailMessage instance with raw MIME (standard Workerd interface)
  try {
    // @ts-ignore
    const { EmailMessage } = await import(/* @vite-ignore */ "cloudflare:email");
    const raw = buildMimeMessage(options);
    const message = new EmailMessage(senderAddr, recipientAddr, raw);
    await binding.send(message);
    return { ok: true };
  } catch (err3: any) {
    attempts.push(`mime: ${err3?.message || String(err3)}`);
  }

  return { ok: false, error: attempts.join(" | ") };
}

/**
 * Generate a sign-in code for `email` (creating the user if needed) and
 * email it. Returns a plain result object — never throws.
 */
export async function sendAuthOtpEmail(rawEmail: string): Promise<SendResult> {
  const email = rawEmail.trim().toLowerCase();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let isNewUser = false;
  let link = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (link.error) {
    const msg = link.error.message.toLowerCase();
    const missing =
      msg.includes("not found") || msg.includes("signups not allowed") || msg.includes("no user");
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

  const props = link.data.properties as { email_otp?: string; action_link?: string } | null;
  const token = props?.email_otp;
  if (!token) {
    return { ok: false, error: "Could not generate a sign-in code.", code: "no_token" };
  }

  const Template = (isNewUser ? SignupEmail : MagicLinkEmail) as unknown as React.ComponentType<
    Record<string, unknown>
  >;
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

  // Explicit OTP subject so mobile lock screens show the code immediately
  const subject = isNewUser
    ? `Your Aloya verification code: ${token}`
    : `Your Aloya sign-in code: ${token}`;

  const VERIFIED_DOMAIN = "stauniverse.tech";
  const defaultFrom = process.env.AUTH_EMAIL_FROM?.trim() || `${SITE_NAME} <noreply@${VERIFIED_DOMAIN}>`;
  const attempts: string[] = [];
  let delivered = false;

  // 1) Cloudflare Worker Email Service (SEND_EMAIL binding)
  const workerEnv = getWorkerEnv() || (process.env as any);
  const cfEmailBinding = workerEnv?.SEND_EMAIL;

  if (cfEmailBinding && typeof cfEmailBinding.send === "function") {
    try {
      const cfFrom =
        process.env.CF_EMAIL_FROM?.trim() ||
        process.env.AUTH_EMAIL_FROM?.trim() ||
        `Aloya CY <auth@app.aloya.cy>`;
      const cfRes = await sendViaCloudflareEmail(cfEmailBinding, {
        from: cfFrom,
        to: email,
        subject,
        text,
        html,
      });
      if (cfRes.ok) {
        delivered = true;
        log.info("email delivered via Cloudflare Email Service", {
          email: redact(email),
          from: cfFrom,
        });
      } else {
        attempts.push(`cloudflare: ${cfRes.error}`);
      }
    } catch (cfErr) {
      attempts.push(`cloudflare: ${cfErr instanceof Error ? cfErr.message : "failed"}`);
    }
  } else {
    attempts.push("cloudflare: SEND_EMAIL binding not present");
  }

  // 2) Resend API (Direct key or Lovable connector gateway)
  if (!delivered) {
    const directKey = process.env.RESEND_DIRECT_API_KEY;
    const gatewayKey = process.env.RESEND_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;

    if (directKey || (gatewayKey && lovableKey)) {
      const endpoint = directKey
        ? "https://api.resend.com/emails"
        : "https://connector-gateway.lovable.dev/resend/emails";
      const headers: Record<string, string> = directKey
        ? { Authorization: `Bearer ${directKey}`, "content-type": "application/json" }
        : {
            Authorization: `Bearer ${lovableKey ?? ""}`,
            "X-Connection-Api-Key": gatewayKey ?? "",
            "content-type": "application/json",
          };

      const fallbackFrom =
        process.env.AUTH_EMAIL_FROM_FALLBACK?.trim() || `${SITE_NAME} <noreply@stauniverse.tech>`;

      const postResend = async (sender: string) => {
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ from: sender, to: [email], subject, html, text }),
        });
        if (res.ok) return { ok: true as const, status: res.status, body: "" };
        return {
          ok: false as const,
          status: res.status,
          body: (await res.text()).slice(0, 300),
        };
      };

      try {
        let out = await postResend(defaultFrom);
        if (
          !out.ok &&
          out.status === 403 &&
          out.body.includes("not verified") &&
          fallbackFrom !== defaultFrom
        ) {
          attempts.push(`resend ${out.status} (${defaultFrom}): ${out.body}`);
          out = await postResend(fallbackFrom);
        }
        if (
          !out.ok &&
          out.status === 403 &&
          out.body.includes("not verified")
        ) {
          attempts.push(`resend ${out.status} (${fallbackFrom}): ${out.body}`);
          out = await postResend(`${SITE_NAME} <onboarding@resend.dev>`);
        }
        if (out.ok) {
          delivered = true;
          log.info("email delivered via Resend", { email: redact(email) });
        } else {
          attempts.push(`resend ${out.status}: ${out.body}`);
        }
      } catch (err) {
        attempts.push(`resend: ${err instanceof Error ? err.message : "failed"}`);
      }
    } else {
      attempts.push("resend: no key configured");
    }
  }

  // 3) Lovable platform email sender
  const lovableApiKey = process.env.LOVABLE_API_KEY;
  if (!delivered && lovableApiKey) {
    try {
      await sendLovableEmail(
        {
          to: email,
          from: `${SITE_NAME} <noreply@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: "transactional",
          label: isNewUser ? "signup" : "magiclink",
          message_id: messageId,
          idempotency_key: messageId,
        } as Parameters<typeof sendLovableEmail>[0],
        { apiKey: lovableApiKey, sendUrl: process.env.LOVABLE_SEND_URL },
      );
      delivered = true;
      log.info("email delivered via Lovable platform", { email: redact(email) });
    } catch (err) {
      attempts.push(`lovable: ${err instanceof Error ? err.message.slice(0, 200) : "failed"}`);
    }
  }

  // 4) Supabase GoTrue fallback (last resort if all custom providers fail)
  if (!delivered) {
    try {
      const res = await supabaseAdmin.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (!res.error) {
        delivered = true;
        log.info("email delivered via Supabase GoTrue fallback", { email: redact(email) });
      } else {
        attempts.push(`supabase: ${res.error.message}`);
      }
    } catch (err) {
      attempts.push(`supabase: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  if (!delivered) {
    const error = attempts.join(" | ");
    log.error("send failed", error, { email: redact(email) });
    void supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: isNewUser ? "signup" : "magiclink",
      recipient_email: email,
      status: "failed",
      error_message: error,
    });
    const msg = error.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("security purposes")) {
      return {
        ok: false,
        error: `Email delivery failed: ${error}`,
        code: "rate_limited",
      };
    }
    return {
      ok: false,
      error: `Email delivery failed: ${error}`,
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
