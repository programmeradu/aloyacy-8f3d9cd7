import { useCallback } from "react";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { createCheckoutSession } from "@/lib/billing.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

export function StripeEmbeddedCheckoutPane({
  planKey,
  returnUrl,
}: {
  planKey: "pro_weekly" | "pro_monthly";
  returnUrl: string;
}) {
  const checkoutFn = useServerFn(createCheckoutSession);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const result = await checkoutFn({
      data: {
        planKey,
        environment: getStripeEnvironment(),
        returnUrl,
      },
    });
    if ("error" in result) throw new Error(result.error);
    return result.clientSecret;
  }, [checkoutFn, planKey, returnUrl]);

  return (
    <div id="checkout" className="w-full">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
