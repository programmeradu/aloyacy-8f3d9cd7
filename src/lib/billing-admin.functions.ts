// One-shot admin: set the Stripe tax code on Pro subscription products to
// txcd_10103001 (SaaS — electronic services). Required by managed_payments
// for end-to-end tax compliance. Safe to run multiple times — idempotent.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "./stripe.server";

const Input = z.object({
  environment: z.enum(["sandbox", "live"]),
  taxCode: z.string().regex(/^txcd_[a-zA-Z0-9]+$/).default("txcd_10103001"),
});

type Result =
  | { ok: true; updated: { id: string; name: string; tax_code: string }[] }
  | { ok: false; error: string };

export const setProTaxCodes = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      // Find products linked to our pro plan keys via price metadata.
      const prices = await stripe.prices.search({
        query:
          "active:'true' AND (metadata['lovable_external_id']:'pro_weekly' OR metadata['lovable_external_id']:'pro_monthly')",
        limit: 10,
      });
      const productIds = new Set<string>();
      for (const p of prices.data) {
        if (typeof p.product === "string") productIds.add(p.product);
      }
      const updated: { id: string; name: string; tax_code: string }[] = [];
      for (const id of productIds) {
        const prod = await stripe.products.update(id, { tax_code: data.taxCode });
        updated.push({ id, name: prod.name, tax_code: data.taxCode });
      }
      return { ok: true, updated };
    } catch (error) {
      return { ok: false, error: getStripeErrorMessage(error) };
    }
  });
