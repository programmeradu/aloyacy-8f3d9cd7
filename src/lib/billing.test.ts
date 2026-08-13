// Pro plan catalogue. Prices are shown on the paywall, the mobile upgrade
// sheet and the marketing page, so the shape is pinned here: any change to a
// key or a price is a deliberate product decision, not a typo.

import { describe, it, expect } from "vitest";
import { PRO_PLANS, getStripeEnvironment, type PlanId } from "./billing";

describe("PRO_PLANS", () => {
  it("offers exactly the weekly and monthly cadences", () => {
    expect(Object.keys(PRO_PLANS).sort()).toEqual(["monthly", "weekly"]);
  });

  it("uses the server-side plan keys the checkout endpoint expects", () => {
    expect(PRO_PLANS.weekly.key).toBe("pro_weekly");
    expect(PRO_PLANS.monthly.key).toBe("pro_monthly");
  });

  it("prices every plan in euros with a cadence suffix", () => {
    for (const id of Object.keys(PRO_PLANS) as PlanId[]) {
      const plan = PRO_PLANS[id];
      expect(plan.price).toMatch(/^€\d+\.\d{2}$/);
      expect(plan.cadence.startsWith("/")).toBe(true);
      expect(plan.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps the monthly plan cheaper per week than the weekly plan", () => {
    const weekly = Number(PRO_PLANS.weekly.price.replace("€", ""));
    const monthly = Number(PRO_PLANS.monthly.price.replace("€", ""));
    expect(monthly / 4).toBeLessThan(weekly);
  });

  it("advertises the saving only on the monthly plan", () => {
    expect(PRO_PLANS.monthly.note).toBeTruthy();
    expect((PRO_PLANS.weekly as { note?: string }).note).toBeUndefined();
  });
});

describe("getStripeEnvironment", () => {
  it("defaults to sandbox when no live publishable token is configured", () => {
    // The test env carries no `pk_live_` token, so read-only surfaces must
    // resolve to sandbox rather than throwing and blanking the page.
    expect(getStripeEnvironment()).toBe("sandbox");
  });
});
