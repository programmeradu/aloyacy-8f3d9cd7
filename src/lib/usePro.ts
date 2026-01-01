import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "./billing";
import { useAuth } from "./useAuth";

type SubRow = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_key: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function useProSubscription() {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSub(null);
      setLoading(false);
      return;
    }
    const env = getStripeEnvironment();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, cancel_at_period_end, plan_key")
        .eq("user_id", user!.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setSub((data as SubRow | null) ?? null);
        setLoading(false);
      }
    }
    load();

    // Unique channel name per hook instance — multiple components use this
    // hook; reusing `sub-${user.id}` returns the already-subscribed channel
    // and `.on()` after `.subscribe()` throws.
    const channel = supabase
      .channel(`sub-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Business rule: cancellation revokes Pro immediately — no end-of-period
  // grace. If the customer cancels (status=canceled or cancel_at_period_end),
  // Pro features lock instantly even if Stripe is still in the billed window.
  const isActive = (() => {
    if (!sub) return false;
    if (sub.cancel_at_period_end) return false;
    const endOk = !sub.current_period_end || new Date(sub.current_period_end) > new Date();
    return ACTIVE_STATUSES.has(sub.status) && endOk;
  })();

  return { isPro: isActive, sub, loading };
}
