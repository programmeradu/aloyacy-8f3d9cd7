// Native Payment Sheet prep for the iOS/Android app.
//
// Embedded Checkout doesn't render in React Native, so the mobile app uses
// Stripe's PaymentSheet, which needs three secrets up front:
//   - customer id
//   - ephemeral key (scoped to that customer + api version)
//   - PaymentIntent (or Subscription's latest_invoice.payment_intent) client_secret
//
// This endpoint produces all three for a Pro subscription, plus the
// publishable key the app needs to initialise Stripe. Unauthenticated by
// design: the app supplies an email, we reuse-or-create the matching Stripe
// Customer (same `metadata.user_id = email` shape the web flow uses once auth
// lands on mobile). The webhook at /api/public/payments/webhook will pick up
// the resulting subscription via `customer.subscription.created`.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createStripeClient,
  getStripeErrorMessage,
  type StripeEnv,
} from "@/lib/stripe.server";

const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const schema = z.object({
  email: z.string().email().max(254),
  planKey: z.enum(["pro_weekly", "pro_monthly"]),
  environment: z.enum(["sandbox", "live"]).default("sandbox"),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mobile-payment-sheet")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

        const env = parsed.data.environment as StripeEnv;
        const publishableKey =
          env === "live"
            ? process.env.PAYMENTS_LIVE_CLIENT_TOKEN
            : process.env.PAYMENTS_SANDBOX_CLIENT_TOKEN;

        try {
          const stripe = createStripeClient(env);

          // Resolve price by lovable_external_id (same as web checkout).
          const prices = await stripe.prices.search({
            query: `active:'true' AND metadata['lovable_external_id']:'${parsed.data.planKey}'`,
            limit: 1,
          });
          const price = prices.data[0];
          if (!price) return json({ error: "Plan not available right now." }, 404);

          // Reuse the customer by email, otherwise create one.
          const existing = await stripe.customers.list({
            email: parsed.data.email,
            limit: 1,
          });
          const customer =
            existing.data[0] ??
            (await stripe.customers.create({
              email: parsed.data.email,
              metadata: { source: "mobile_app" },
            }));

          // Subscription with default_incomplete so PaymentSheet can confirm
          // the first invoice's PaymentIntent.
          const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: price.id }],
            payment_behavior: "default_incomplete",
            payment_settings: { save_default_payment_method: "on_subscription" },
            expand: ["latest_invoice.payment_intent"],
            metadata: { plan_key: parsed.data.planKey, source: "mobile_app" },
          });

          const invoice = subscription.latest_invoice as {
            payment_intent?: { client_secret?: string | null } | string | null;
          } | null;
          const pi =
            invoice && typeof invoice.payment_intent === "object"
              ? invoice.payment_intent
              : null;
          const clientSecret = pi?.client_secret ?? null;
          if (!clientSecret) {
            return json({ error: "Stripe did not return a payment secret." }, 502);
          }

          const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: STRIPE_API_VERSION },
          );

          return json({
            customer: customer.id,
            ephemeralKey: ephemeralKey.secret,
            paymentIntent: clientSecret,
            publishableKey: publishableKey ?? null,
            subscriptionId: subscription.id,
          });
        } catch (error) {
          return json({ error: getStripeErrorMessage(error) }, 500);
        }
      },
    },
  },
});
