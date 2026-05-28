// Web stub – @stripe/stripe-react-native is native-only and must never be
// imported by the Web bundler.  Components that import from `@/lib/wallet`
// will get these no-op stubs when running on web.

export type PlanKey = "pro_weekly" | "pro_monthly";

export type CheckoutResult =
  | { ok: true; subscriptionId: string; linkedUserId: string | null }
  | { ok: false; canceled?: boolean; message: string };

export async function startProCheckout(_opts: {
  email?: string;
  planKey: PlanKey;
  promotionCode?: string;
}): Promise<CheckoutResult> {
  return {
    ok: false,
    message: "In-app purchases are only available on iOS and Android.",
  };
}

