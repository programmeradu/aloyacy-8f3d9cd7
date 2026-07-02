// Trial eligibility hook — shared between PaywallSheet, ProUpsell and any
// other Pro surface. Returns `null` while unknown, `true` when the rider
// can start the 7-day free trial, `false` when they've already used it
// (per-account or per-device, one trial each).
//
// Signed-out users are treated as eligible: the promise is real once they
// sign in. If their account/device turns out to already have a grant, the
// PaywallSheet re-checks after sign-in and hides the copy before checkout.

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTrialEligibility } from "@/lib/trial.functions";
import { getStripeEnvironment } from "@/lib/billing";
import { getDeviceId } from "@/lib/device-id";
import { useAuth } from "@/lib/useAuth";
import { useProSubscription } from "@/lib/usePro";

export function useTrialEligibility(): boolean | null {
  const { isPermanent } = useAuth();
  const { isPro } = useProSubscription();
  const eligibilityFn = useServerFn(getTrialEligibility);
  const [eligible, setEligible] = useState<boolean | null>(null);

  useEffect(() => {
    if (isPro) {
      setEligible(false);
      return;
    }
    if (!isPermanent) {
      // Optimistic — encourage sign-in with the trial promise. PaywallSheet
      // will re-check server-side once the user actually signs in.
      setEligible(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await eligibilityFn({
          data: { deviceId: getDeviceId(), environment: getStripeEnvironment() },
        });
        if (!cancelled) setEligible(res.eligible);
      } catch {
        if (!cancelled) setEligible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPermanent, isPro, eligibilityFn]);

  return eligible;
}
