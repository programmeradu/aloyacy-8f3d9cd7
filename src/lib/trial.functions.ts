// Free-trial server functions.
//
// Two entry points:
//   claimAutoTrial   — grants a 7-day trial the first time a signed-in user
//                      hits the app on a given device.
//   redeemPromoCode  — grants a trial based on a code from the promo_codes
//                      registry (variable duration, optional expiry + cap).
//
// Enforcement: trial_grants has UNIQUE(user_id, environment) AND
// UNIQUE(device_id, environment). Either collision short-circuits the grant.
//
// Entitlement is delivered by inserting a subscriptions row with
// status='trialing' + current_period_end=expiresAt. usePro() already treats
// 'trialing' as Pro, and the subscriptions realtime channel invalidates
// clients automatically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AUTO_TRIAL_DAYS = 7;

const DeviceInput = z.object({
  deviceId: z.string().min(6).max(128),
  environment: z.enum(["sandbox", "live"]),
});

const PromoInput = DeviceInput.extend({
  code: z.string().trim().min(2).max(40),
});

type GrantResult =
  | { ok: true; expiresAt: string; source: "auto" | "promo"; code?: string }
  | { ok: false; reason: string };

async function insertTrial(opts: {
  userId: string;
  deviceId: string;
  environment: "sandbox" | "live";
  durationDays: number;
  source: "auto" | "promo";
  promoCode?: string;
}): Promise<GrantResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expiresAt = new Date(Date.now() + opts.durationDays * 86_400_000);

  const { error: grantErr } = await supabaseAdmin.from("trial_grants").insert({
    user_id: opts.userId,
    device_id: opts.deviceId,
    environment: opts.environment,
    duration_days: opts.durationDays,
    source: opts.source,
    promo_code: opts.promoCode ?? null,
    expires_at: expiresAt.toISOString(),
  });

  if (grantErr) {
    // Unique violation → already used on this device or account.
    if (grantErr.code === "23505") {
      const scope = grantErr.message.includes("device")
        ? "This device has already used its free trial."
        : "Your account has already used its free trial.";
      return { ok: false, reason: scope };
    }
    return { ok: false, reason: "Could not start trial. Please try again." };
  }

  // Mirror as a subscription row so usePro() picks it up immediately.
  const { error: subErr } = await supabaseAdmin.from("subscriptions").insert({
    user_id: opts.userId,
    environment: opts.environment,
    status: "trialing",
    plan_key: opts.source === "promo" ? `trial_promo:${opts.promoCode}` : "trial_auto",
    current_period_end: expiresAt.toISOString(),
    cancel_at_period_end: false,
  });

  if (subErr) {
    // Roll the grant back so the user can retry rather than losing their slot.
    await supabaseAdmin
      .from("trial_grants")
      .delete()
      .eq("user_id", opts.userId)
      .eq("environment", opts.environment);
    return { ok: false, reason: "Could not activate Pro. Please try again." };
  }

  return {
    ok: true,
    expiresAt: expiresAt.toISOString(),
    source: opts.source,
    ...(opts.promoCode ? { code: opts.promoCode } : {}),
  };
}

export const getTrialStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => DeviceInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [byUser, byDevice] = await Promise.all([
      supabase
        .from("trial_grants")
        .select("expires_at, source, promo_code")
        .eq("user_id", userId)
        .eq("environment", data.environment)
        .maybeSingle(),
      supabase
        .from("trial_grants")
        .select("user_id")
        .eq("device_id", data.deviceId)
        .eq("environment", data.environment)
        .maybeSingle(),
    ]);

    const usedByUser = !!byUser.data;
    const usedByDevice = !!byDevice.data;

    return {
      usedByUser,
      usedByDevice,
      eligibleAuto: !usedByUser && !usedByDevice,
      expiresAt: (byUser.data?.expires_at as string | undefined) ?? null,
    };
  });

export const claimAutoTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => DeviceInput.parse(data))
  .handler(async ({ data, context }): Promise<GrantResult> => {
    return insertTrial({
      userId: context.userId,
      deviceId: data.deviceId,
      environment: data.environment,
      durationDays: AUTO_TRIAL_DAYS,
      source: "auto",
    });
  });

export const redeemPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => PromoInput.parse(data))
  .handler(async ({ data, context }): Promise<GrantResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();

    const { data: promo, error } = await supabaseAdmin
      .from("promo_codes")
      .select("code, duration_days, max_redemptions, redemptions_count, expires_at, active")
      .eq("code", code)
      .maybeSingle();

    if (error || !promo) return { ok: false, reason: "That code isn't valid." };
    if (!promo.active) return { ok: false, reason: "That code is no longer active." };
    if (promo.expires_at && new Date(promo.expires_at as string) < new Date()) {
      return { ok: false, reason: "That code has expired." };
    }
    if (
      promo.max_redemptions != null &&
      (promo.redemptions_count as number) >= (promo.max_redemptions as number)
    ) {
      return { ok: false, reason: "That code has reached its redemption limit." };
    }

    const result = await insertTrial({
      userId: context.userId,
      deviceId: data.deviceId,
      environment: data.environment,
      durationDays: promo.duration_days as number,
      source: "promo",
      promoCode: code,
    });

    if (result.ok) {
      await supabaseAdmin
        .from("promo_codes")
        .update({ redemptions_count: (promo.redemptions_count as number) + 1 })
        .eq("code", code);
    }

    return result;
  });
