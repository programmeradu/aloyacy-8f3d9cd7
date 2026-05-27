import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "./stripe.server";

const CheckoutInput = z.object({
  planKey: z.enum(["pro_weekly", "pro_monthly"]),
  environment: z.enum(["sandbox", "live"]),
  returnUrl: z.string().url(),
});

type CheckoutResult = { url: string } | { error: string };

async function findPriceByPlanKey(stripe: ReturnType<typeof createStripeClient>, planKey: string) {
  // Lovable's product creation stamps `lovable_external_id` on price metadata.
  const prices = await stripe.prices.search({
    query: `active:'true' AND metadata['lovable_external_id']:'${planKey}'`,
    limit: 1,
  });
  return prices.data[0] ?? null;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CheckoutInput.parse(data))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId, claims } = context;
    const env = data.environment as StripeEnv;
    const stripe = createStripeClient(env);

    try {
      const price = await findPriceByPlanKey(stripe, data.planKey);
      if (!price) return { error: "Plan not available right now." };

      // Reuse existing Stripe customer if we already have one for this user/env.
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id, status, current_period_end")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.status === "active" || existing?.status === "trialing") {
        return { error: "You already have an active Pro subscription." };
      }

      const customerId =
        existing?.stripe_customer_id ??
        (await stripe.customers.create({
          email: (claims as { email?: string })?.email,
          metadata: { user_id: userId },
        })).id;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${data.returnUrl}?pro=success`,
        cancel_url: `${data.returnUrl}?pro=cancelled`,
        allow_promotion_codes: true,
        automatic_tax: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
        subscription_data: {
          metadata: { user_id: userId, plan_key: data.planKey },
        },
        metadata: { user_id: userId, plan_key: data.planKey },
      });

      if (!session.url) return { error: "Could not start checkout." };
      return { url: session.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

const PortalInput = z.object({
  environment: z.enum(["sandbox", "live"]),
  returnUrl: z.string().url(),
});

type PortalResult = { url: string } | { error: string };

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => PortalInput.parse(data))
  .handler(async ({ data, context }): Promise<PortalResult> => {
    const { supabase, userId } = context;
    const env = data.environment as StripeEnv;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_customer_id) return { error: "No subscription found." };

    try {
      const stripe = createStripeClient(env);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
