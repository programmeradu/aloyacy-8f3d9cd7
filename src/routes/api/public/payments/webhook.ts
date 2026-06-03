import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import {
  type StripeEnv,
  createStripeClient,
  getWebhookSecret,
} from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function parseEnv(url: URL): StripeEnv {
  return url.searchParams.get("env") === "live" ? "live" : "sandbox";
}

async function fetchCustomerEmail(customerId: string, env: StripeEnv) {
  try {
    const stripe = createStripeClient(env);
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer.email as string | null) ?? null;
  } catch {
    return null;
  }
}

async function fetchUserIdFromCustomer(customerId: string, env: StripeEnv) {
  try {
    const stripe = createStripeClient(env);
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer.metadata?.user_id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// Fire-and-forget welcome email. Uses Resend connector via the Lovable
// gateway. Failure never blocks the webhook.
async function sendWelcomeEmail(to: string, planKey: string | null) {
  const lovable = process.env.LOVABLE_API_KEY;
  const resend = process.env.RESEND_API_KEY;
  if (!lovable || !resend) return;
  const planLabel = planKey === "pro_weekly" ? "Weekly" : planKey === "pro_monthly" ? "Monthly" : "Pro";
  try {
    await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": resend,
      },
      body: JSON.stringify({
        from: "Aloya <onboarding@resend.dev>",
        to: [to],
        subject: "You're in — welcome to Aloya Pro",
        html: `
          <div style="font-family: ui-sans-serif, system-ui; max-width:520px; margin:0 auto; padding:32px 24px; color:#1a1a1a;">
            <p style="font-family: ui-monospace, monospace; font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:#a86b2c; margin:0 0 12px;">Aloya Pro · ${planLabel}</p>
            <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-weight:400; font-size:34px; line-height:1.1; margin:0 0 16px;">The whole island, in your pocket.</h1>
            <p style="font-size:15px; line-height:1.6; color:#4a4a4a; margin:0 0 24px;">Pro is unlocked across every device you sign in on. Multi-leg trips, live boarding cues, push alerts, and offline schedules are now yours.</p>
            <p style="font-size:13px; line-height:1.6; color:#6a6a6a; margin:0;">Cancel anytime from the Wallet screen. Reply to this email if anything looks off — a human reads it.</p>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.warn("[stripe-webhook] welcome email failed", err);
  }
}

async function upsertFromSubscription(
  sub: Stripe.Subscription,
  env: StripeEnv,
  opts: { sendWelcome?: boolean } = {},
) {
  const userId =
    (sub.metadata?.user_id as string | undefined) ??
    (await fetchUserIdFromCustomer(sub.customer as string, env)) ??
    null;
  if (!userId) {
    console.warn("[stripe-webhook] subscription without user_id", sub.id);
    return;
  }

  const item = sub.items.data[0];
  const price = item?.price;
  const planKey =
    (price?.metadata?.lovable_external_id as string | undefined) ??
    (price?.lookup_key as string | undefined) ??
    null;
  const periodEnd =
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;

  // Detect first-time activation: row didn't exist OR previous status wasn't active.
  let shouldWelcome = false;
  if (opts.sendWelcome && (sub.status === "active" || sub.status === "trialing")) {
    const { data: prev } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    if (!prev || (prev.status !== "active" && prev.status !== "trialing")) {
      shouldWelcome = true;
    }
  }

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: price?.id ?? null,
      product_id:
        typeof price?.product === "string" ? price.product : price?.product?.id ?? null,
      plan_key: planKey,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (shouldWelcome) {
    const email = await fetchCustomerEmail(sub.customer as string, env);
    if (email) await sendWelcomeEmail(email, planKey);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = parseEnv(new URL(request.url));
        const signature = request.headers.get("stripe-signature");
        const body = await request.text();
        if (!signature) return new Response("Missing signature", { status: 400 });

        const stripe = createStripeClient(env);
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            getWebhookSecret(env),
          );
        } catch (err) {
          return new Response(
            `Invalid signature: ${err instanceof Error ? err.message : "unknown"}`,
            { status: 400 },
          );
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              if (session.subscription) {
                const sub = await stripe.subscriptions.retrieve(
                  session.subscription as string,
                );
                await upsertFromSubscription(sub, env, { sendWelcome: true });
              }
              break;
            }
            case "customer.subscription.created": {
              await upsertFromSubscription(
                event.data.object as Stripe.Subscription,
                env,
                { sendWelcome: true },
              );
              break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              await upsertFromSubscription(
                event.data.object as Stripe.Subscription,
                env,
              );
              break;
            }
            default:
              break;
          }
          return Response.json({ received: true });
        } catch (err) {
          console.error("[stripe-webhook] handler error", err);
          return new Response("Handler error", { status: 500 });
        }
      },
    },
  },
});
