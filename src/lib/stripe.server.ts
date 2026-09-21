import Stripe from "stripe";
import { getWorkerEnv } from "@/lib/worker-env";

export type StripeEnv = "sandbox" | "live";

function readEnv(key: string): string | undefined {
  const workerEnv = getWorkerEnv() as Record<string, string | undefined> | undefined;
  return workerEnv?.[key]?.trim() || process.env[key]?.trim();
}

export function getConnectionApiKey(env: StripeEnv): string {
  // 1. Direct secret key (sk_live_* or sk_test_*) takes top priority
  const directKey = readEnv("STRIPE_SECRET_KEY") || readEnv("STRIPE_API_KEY");
  if (directKey) return directKey;

  // 2. Environment-specific keys
  if (env === "live") {
    const liveKey = readEnv("STRIPE_LIVE_API_KEY") || readEnv("STRIPE_LIVE_SECRET_KEY");
    if (liveKey) return liveKey;
    throw new Error(
      "STRIPE_LIVE_API_KEY is not configured. Add STRIPE_SECRET_KEY or STRIPE_LIVE_API_KEY to Cloudflare Worker secrets.",
    );
  } else {
    const sandboxKey =
      readEnv("STRIPE_SANDBOX_API_KEY") ||
      readEnv("STRIPE_TEST_SECRET_KEY") ||
      readEnv("STRIPE_TEST_API_KEY");
    if (sandboxKey) return sandboxKey;
    throw new Error(
      "STRIPE_SANDBOX_API_KEY is not configured. Add STRIPE_SANDBOX_API_KEY to Cloudflare Worker secrets.",
    );
  }
}

export function createStripeClient(env: StripeEnv): Stripe {
  const apiKey = getConnectionApiKey(env);
  return new Stripe(apiKey, {
    apiVersion: "2026-03-25.dahlia",
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      message?: string;
      raw?: { message?: string };
    };
    return e.raw?.message ?? e.message ?? "Stripe request failed";
  }
  return "Stripe request failed";
}

export function getWebhookSecret(env: StripeEnv): string {
  const direct = readEnv("STRIPE_WEBHOOK_SECRET");
  if (direct) return direct;

  const key =
    env === "sandbox" ? "PAYMENTS_SANDBOX_WEBHOOK_SECRET" : "PAYMENTS_LIVE_WEBHOOK_SECRET";
  const val = readEnv(key);
  if (!val) {
    throw new Error(`${key} is not configured on Cloudflare Workers`);
  }
  return val;
}

/**
 * Resolves a Stripe Price for a plan key ("pro_weekly" | "pro_monthly").
 * Looks up by metadata, then by lookup_key, and auto-provisions the product
 * and recurring price in EUR if missing.
 */
export async function findOrCreatePriceByPlanKey(
  stripe: Stripe,
  planKey: string,
): Promise<Stripe.Price | null> {
  if (!/^[a-zA-Z0-9_-]+$/.test(planKey)) throw new Error("Invalid planKey");

  // 1. Check by metadata
  try {
    const prices = await stripe.prices.search({
      query: `active:'true' AND metadata['lovable_external_id']:'${planKey}'`,
      limit: 1,
    });
    if (prices.data.length > 0) return prices.data[0];
  } catch {
    // Ignore and proceed to lookup_keys
  }

  // 2. Check by lookup_key
  try {
    const lookupPrices = await stripe.prices.list({
      lookup_keys: [planKey],
      active: true,
      limit: 1,
    });
    if (lookupPrices.data.length > 0) return lookupPrices.data[0];
  } catch {
    // Ignore and proceed to auto-provision
  }

  // 3. Auto-provision product and price in EUR
  try {
    const planConfig =
      planKey === "pro_weekly"
        ? {
            name: "Aloya Pro (Weekly)",
            unit_amount: 199,
            currency: "eur",
            interval: "week" as const,
          }
        : planKey === "pro_monthly"
        ? {
            name: "Aloya Pro (Monthly)",
            unit_amount: 699,
            currency: "eur",
            interval: "month" as const,
          }
        : null;

    if (!planConfig) return null;

    const product = await stripe.products.create({
      name: planConfig.name,
      metadata: { lovable_external_id: planKey, app: "aloya" },
      tax_code: "txcd_10103001",
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: planConfig.unit_amount,
      currency: planConfig.currency,
      recurring: { interval: planConfig.interval },
      metadata: { lovable_external_id: planKey },
      lookup_key: planKey,
    });

    return price;
  } catch {
    return null;
  }
}
