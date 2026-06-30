// Native Stripe Payment Sheet integration for Pro subscriptions.
//
// Flow:
//   1. Ask the backend (`/api/public/mobile-payment-sheet`) for a
//      { customer, ephemeralKey, paymentIntent, publishableKey } bundle.
//   2. Initialise the Stripe SDK with the returned publishable key.
//   3. initPaymentSheet → presentPaymentSheet. The user pays via Apple Pay,
//      Google Pay, card, Link, etc. — Stripe handles all the UI.
//   4. Webhook (`/api/public/payments/webhook`) flips the subscription to
//      active and the next app launch reads the entitlement.

import {
  initPaymentSheet,
  presentPaymentSheet,
  initStripe,
} from "@stripe/stripe-react-native";
import { API_BASE } from "./api";

export type PlanKey = "pro_weekly" | "pro_monthly";

type PrepResponse = {
  customer: string;
  ephemeralKey: string;
  paymentIntent: string;
  publishableKey: string | null;
  subscriptionId: string;
};

let stripeReady = false;

async function ensureStripeInitialised(publishableKey: string) {
  if (stripeReady) return;
  await initStripe({
    publishableKey,
    merchantIdentifier: "merchant.cy.aloya.app",
    urlScheme: "aloya",
  });
  stripeReady = true;
}

export type CheckoutResult =
  | { ok: true; subscriptionId: string }
  | { ok: false; canceled?: boolean; message: string };

export async function startProCheckout(opts: {
  email: string;
  planKey: PlanKey;
}): Promise<CheckoutResult> {
  let prep: PrepResponse;
  try {
    const res = await fetch(`${API_BASE}/api/public/mobile-payment-sheet`, {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: opts.email,
        planKey: opts.planKey,
        environment: "sandbox",
      }),
    });
    const body = (await res.json()) as PrepResponse | { error: unknown };
    if (!res.ok || "error" in body) {
      const msg =
        "error" in body && typeof body.error === "string"
          ? body.error
          : `Checkout prep failed (${res.status})`;
      return { ok: false, message: msg };
    }
    prep = body;
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? "Network error" };
  }

  if (!prep.publishableKey) {
    return { ok: false, message: "Payments not configured for this build." };
  }

  await ensureStripeInitialised(prep.publishableKey);

  const init = await initPaymentSheet({
    merchantDisplayName: "Aloya",
    customerId: prep.customer,
    customerEphemeralKeySecret: prep.ephemeralKey,
    paymentIntentClientSecret: prep.paymentIntent,
    allowsDelayedPaymentMethods: false,
    returnURL: "aloya://checkout-return",
    applePay: { merchantCountryCode: "CY" },
    googlePay: {
      merchantCountryCode: "CY",
      currencyCode: "EUR",
      testEnv: true,
    },
  });
  if (init.error) return { ok: false, message: init.error.message };

  const present = await presentPaymentSheet();
  if (present.error) {
    const canceled = present.error.code === "Canceled";
    return { ok: false, canceled, message: present.error.message };
  }

  return { ok: true, subscriptionId: prep.subscriptionId };
}
