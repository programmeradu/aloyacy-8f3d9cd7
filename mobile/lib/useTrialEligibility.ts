// Mobile trial eligibility — mirrors `src/lib/useTrialEligibility.ts`.
// Reads `trial_grants` directly under RLS (`auth.uid() = user_id`) plus a
// device-scoped check via the same table. Signed-out users are optimistic
// so the "7-day free trial" line surfaces and rewards sign-in.

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useSession } from "./auth";
import { useProSubscription } from "./usePro";
import { getOrCreateDeviceId } from "./push";

const ENV: "sandbox" | "live" =
  process.env.EXPO_PUBLIC_STRIPE_ENV === "live" ? "live" : "sandbox";

export function useTrialEligibility(): boolean | null {
  const { user } = useSession();
  const { isPro } = useProSubscription();
  const [eligible, setEligible] = useState<boolean | null>(null);

  useEffect(() => {
    if (isPro) {
      setEligible(false);
      return;
    }
    if (!user) {
      setEligible(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        const [byUser, byDevice] = await Promise.all([
          supabase
            .from("trial_grants")
            .select("id")
            .eq("user_id", user.id)
            .eq("environment", ENV)
            .maybeSingle(),
          deviceId
            ? supabase
                .from("trial_grants")
                .select("id")
                .eq("device_id", deviceId)
                .eq("environment", ENV)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (!cancelled) setEligible(!byUser.data && !byDevice.data);
      } catch {
        if (!cancelled) setEligible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isPro]);

  return eligible;
}
