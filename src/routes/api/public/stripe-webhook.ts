import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import {
  type StripeEnv,
  createStripeClient,
  getWebhookSecret,
} from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function parseEnv(url: URL): StripeEnv {
  const v = url.searchParams.get("env");
  return v === "live" ? "live" : "sandbox";
}

async function upsertFromSubscription(sub: Stripe.Subscription, env: StripeEnv) {
  const userId =
    (sub.metadata?.user_id as string | undefined) ??
    ((await fetchUserIdFromCustomer(sub.customer as string, env)) ?? null);
  if (!userId) return;

  const item = sub.items.data[0];
  const price = item?.price;
  const planKey = (price?.metadata?.lovable_external_id as string | undefined) ?? null;
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end;

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: price?.id ?? null,
      product_id: typeof price?.product === "string" ? price.product : price?.product?.id ?? null,
      plan_key: planKey,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
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

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = parseEnv(url);
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
                await upsertFromSubscription(sub, env);
              }
              break;
            }
            case "customer.subscription.created":
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
          return new Response("ok");
        } catch (err) {
          console.error("Webhook handler error", err);
          return new Response("Handler error", { status: 500 });
        }
      },
    },
  },
});
