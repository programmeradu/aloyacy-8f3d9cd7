// Pro entitlement hook — mirror of `src/lib/usePro.ts`.
//
// Reads the rider's most recent subscription row from Lovable Cloud
// (`subscriptions` table) under the same RLS the web app uses, and
// applies the same business rule: a queued cancel revokes Pro
// instantly, no end-of-period grace.

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useSession } from "./auth";

type SubRow = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_key: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function useProSubscription() {
  const { user } = useSession();
  const [sub, setSub] = useState<SubRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSub(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, cancel_at_period_end, plan_key")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setSub((data as SubRow | null) ?? null);
        setLoading(false);
      }
    }
    void load();

    const channel = supabase
      .channel(`sub-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const isActive = (() => {
    if (!sub) return false;
    if (sub.cancel_at_period_end) return false;
    const endOk =
      !sub.current_period_end ||
      new Date(sub.current_period_end) > new Date();
    return ACTIVE_STATUSES.has(sub.status) && endOk;
  })();

  return { isPro: isActive, sub, loading };
}
