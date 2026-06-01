import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

// Derive env from token prefix. When the token is missing (e.g. production
// build shipped before payments go-live finished), default to "sandbox" so
// read-only hooks like useProSubscription don't crash the entire app. The
// actual checkout flow (getStripe) still throws loudly if invoked.
const environment: StripeEnv = clientToken?.startsWith("pk_live_") ? "live" : "sandbox";

export function isPaymentsConfigured(): boolean {
  return !!clientToken;
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
    stripePromise = loadStripe(clientToken);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return environment;
}
