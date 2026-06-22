import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

type ProState = {
  isPro: boolean;
  sub: SubRow | null;
  loading: boolean;
};

const ProContext = createContext<ProState | null>(null);

export function ProSubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [sub, setSub] = useState<SubRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
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
        .eq("user_id", userId)
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

    const channel = supabase
      .channel(`sub-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Business rule: cancellation revokes Pro immediately — no end-of-period
  // grace. If the customer cancels (status=canceled or cancel_at_period_end),
  // Pro features lock instantly even if Stripe is still in the billed window.
  const isActive = (() => {
    if (!sub) return false;
    if (sub.cancel_at_period_end) return false;
    const endOk = !sub.current_period_end || new Date(sub.current_period_end) > new Date();
    return ACTIVE_STATUSES.has(sub.status) && endOk;
  })();

  const value = useMemo(
    () => ({ isPro: isActive, sub, loading }),
    [isActive, sub, loading],
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function useProSubscription() {
  const context = useContext(ProContext);
  if (!context) {
    throw new Error("useProSubscription must be used within ProSubscriptionProvider");
  }
  return context;
}
