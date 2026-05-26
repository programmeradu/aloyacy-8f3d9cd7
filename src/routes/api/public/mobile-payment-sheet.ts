// Native Payment Sheet prep for the iOS/Android app.
//
// Embedded Checkout doesn't render in React Native, so the mobile app uses
// Stripe's PaymentSheet, which needs three secrets up front:
//   - customer id
//   - ephemeral key (scoped to that customer + api version)
//   - PaymentIntent (or Subscription's latest_invoice.payment_intent) client_secret
//
// Auth: if the request carries a Supabase bearer token, we verify it against
// the same Lovable Cloud project and tie the resulting Stripe customer +
// subscription to that auth.uid() via `metadata.user_id`. This is what the
// `/api/public/payments/webhook` handler looks up to grant entitlement to
// the right account (matching the web checkout flow). When no token is
// supplied we still allow an email-only path so guests can subscribe and
// link later, but signed-in users always get the user_id binding.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
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
  "Access-Control-Allow-Headers": "content-type, authorization",
};

const schema = z.object({
  email: z.string().email().max(254).optional(),
  planKey: z.enum(["pro_weekly", "pro_monthly"]),
  environment: z.enum(["sandbox", "live"]).default("sandbox"),
  deviceId: z.string().min(6).max(128).optional(),
  promotionCode: z.string().min(1).max(64).optional(),
});

const TRIAL_DAYS = 7;


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

async function resolveUser(request: Request): Promise<
  { id: string; email: string | null } | null
> {
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
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
        const publishableKey = process.env.VITE_PAYMENTS_CLIENT_TOKEN ?? null;

        const sessionUser = await resolveUser(request);
        const email =
          sessionUser?.email?.toLowerCase() ??
          parsed.data.email?.toLowerCase() ??
          null;
        if (!email) {
          return json(
            { error: "Sign in or provide an email to continue." },
            400,
          );
        }

        try {
          const stripe = createStripeClient(env);

          // Resolve price by lovable_external_id (same as web checkout).
          const prices = await stripe.prices.search({
            query: `active:'true' AND metadata['lovable_external_id']:'${parsed.data.planKey}'`,
            limit: 1,
          });
          const price = prices.data[0];
          if (!price) return json({ error: "Plan not available right now." }, 404);

          // Prefer matching an existing customer by user_id metadata so a
          // single auth.uid never spawns duplicate Stripe customers across
          // device + web. Fall back to email, then create.
          let customer: { id: string } | null = null;
          if (sessionUser) {
            const byMeta = await stripe.customers.search({
              query: `metadata['user_id']:'${sessionUser.id}'`,
              limit: 1,
            });
            customer = byMeta.data[0] ?? null;
          }
          if (!customer) {
            const byEmail = await stripe.customers.list({ email, limit: 1 });
            customer = byEmail.data[0] ?? null;
          }
          if (!customer) {
            customer = await stripe.customers.create({
              email,
              metadata: {
                source: "mobile_app",
                ...(sessionUser ? { user_id: sessionUser.id } : {}),
              },
            });
          } else if (sessionUser) {
            // Backfill user_id on a pre-existing email-matched customer so
            // the webhook can resolve entitlement to the signed-in account.
            await stripe.customers.update(customer.id, {
              metadata: { user_id: sessionUser.id, source: "mobile_app" },
            });
          }

          const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: price.id }],
            payment_behavior: "default_incomplete",
            payment_settings: { save_default_payment_method: "on_subscription" },
            expand: ["latest_invoice.payment_intent"],
            metadata: {
              plan_key: parsed.data.planKey,
              source: "mobile_app",
              ...(sessionUser ? { user_id: sessionUser.id } : {}),
            },
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
            linkedUserId: sessionUser?.id ?? null,
          });
        } catch (error) {
          return json({ error: getStripeErrorMessage(error) }, 500);
        }
      },
    },
  },
});
