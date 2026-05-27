// Client-safe billing helpers — re-exports environment from the Stripe loader
// so client code has one source of truth.
export { getStripeEnvironment } from "./stripe";

export const PRO_PLANS = {
  weekly: { key: "pro_weekly", label: "Weekly", price: "€1.99", cadence: "/week" },
  monthly: {
    key: "pro_monthly",
    label: "Monthly",
    price: "€6.99",
    cadence: "/month",
    note: "Save 18%",
  },
} as const;

export type PlanId = keyof typeof PRO_PLANS;
