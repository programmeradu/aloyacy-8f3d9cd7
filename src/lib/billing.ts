// Client-safe billing helpers.
import type { StripeEnv } from "./stripe.server";

export function getStripeEnvironment(): StripeEnv {
  // Sandbox unless we're on the production domain.
  if (typeof window === "undefined") return "sandbox";
  return window.location.hostname === "aloyacy.lovable.app" ? "live" : "sandbox";
}

export const PRO_PLANS = {
  weekly: { key: "pro_weekly", label: "Weekly", price: "€1.99", cadence: "/week" },
  monthly: { key: "pro_monthly", label: "Monthly", price: "€6.99", cadence: "/month", note: "Save 18%" },
} as const;

export type PlanId = keyof typeof PRO_PLANS;
