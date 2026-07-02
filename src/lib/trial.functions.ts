// Trial eligibility check. Stripe owns the trial lifecycle
// (subscription_data.trial_period_days) — we only keep trial_grants as an
// anti-abuse ledger enforcing one trial per device AND per account.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EligibilityInput = z.object({
  deviceId: z.string().min(6).max(128),
  environment: z.enum(["sandbox", "live"]),
});

export const getTrialEligibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => EligibilityInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [byUser, byDevice] = await Promise.all([
      supabase
        .from("trial_grants")
        .select("id")
        .eq("user_id", userId)
        .eq("environment", data.environment)
        .maybeSingle(),
      supabase
        .from("trial_grants")
        .select("id")
        .eq("device_id", data.deviceId)
        .eq("environment", data.environment)
        .maybeSingle(),
    ]);
    return { eligible: !byUser.data && !byDevice.data };
  });
