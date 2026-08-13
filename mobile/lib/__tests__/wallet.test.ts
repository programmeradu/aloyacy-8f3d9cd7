import { describe, it, expect } from "vitest";
import { startProCheckout } from "../wallet";

// The web build ships stubbed in-app purchases; the contract this suite pins
// is that it *always* resolves (never throws) so the paywall can render a
// plain-language explanation instead of crashing.
describe("startProCheckout (web stub)", () => {
  it("declines with a platform explanation", async () => {
    const result = await startProCheckout({ planKey: "pro_monthly" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/only available on iOS and Android/i);
      expect(result.canceled).toBeUndefined();
    }
  });

  it("declines the weekly plan the same way, with or without extras", async () => {
    const weekly = await startProCheckout({
      planKey: "pro_weekly",
      email: "rider@example.com",
      promotionCode: "SUMMER",
    });
    expect(weekly).toEqual({
      ok: false,
      message: "In-app purchases are only available on iOS and Android.",
    });
  });
});
