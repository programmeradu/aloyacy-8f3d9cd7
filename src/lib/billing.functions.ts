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

type CheckoutResult = { clientSecret: string } | { error: string };

async function findPriceByPlanKey(
  stripe: ReturnType<typeof createStripeClient>,
  planKey: string,
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(planKey)) throw new Error("Invalid planKey");
  const prices = await stripe.prices.search({
    query: `active:'true' AND metadata['lovable_external_id']:'${planKey}'`,
    limit: 1,
  });
  return prices.data[0] ?? null;
}

// Resolve a Stripe Customer that carries metadata.user_id. Searches by
// metadata first (across devices), then by email, then creates a fresh one.
async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { userId: string; email?: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");

  const found = await stripe.customers.search({
    query: `metadata['user_id']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;

  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const c = existing.data[0];
      if (c.metadata?.user_id !== options.userId) {
        await stripe.customers.update(c.id, {
          metadata: { ...c.metadata, user_id: options.userId },
        });
      }
      return c.id;
    }
  }

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { user_id: options.userId },
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CheckoutInput.parse(data))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId, claims } = context;
    const env = data.environment as StripeEnv;

    try {
      const stripe = createStripeClient(env);

      // Reject if user already has an active subscription in this env.
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        existing &&
        (existing.status === "active" || existing.status === "trialing") &&
        (!existing.current_period_end ||
          new Date(existing.current_period_end as string) > new Date())
      ) {
        return { error: "You already have an active Pro subscription." };
      }

      const price = await findPriceByPlanKey(stripe, data.planKey);
      if (!price) return { error: "Plan not available right now." };

      const email = (claims as { email?: string })?.email;
      const customerId = await resolveOrCreateCustomer(stripe, { userId, email });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: `${data.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
        customer: customerId,
        line_items: [{ price: price.id, quantity: 1 }],
        allow_promotion_codes: true,
        managed_payments: { enabled: true },
        metadata: { user_id: userId, plan_key: data.planKey },
        subscription_data: {
          metadata: { user_id: userId, plan_key: data.planKey },
        },
      });

      if (!session.client_secret)
        return { error: "Stripe did not return a checkout secret." };
      return { clientSecret: session.client_secret };
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
        customer: sub.stripe_customer_id as string,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
