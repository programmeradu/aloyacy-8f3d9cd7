import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createPortalSession } from "@/lib/billing.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { useProSubscription } from "@/lib/usePro";
import { useAuth } from "@/lib/useAuth";

export function ProAccountCard() {
  const { isPro, sub, loading } = useProSubscription();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portalFn = useServerFn(createPortalSession);

  if (loading || !isPro) return null;

  const renewsAt = sub?.current_period_end
    ? new Date(sub.current_period_end)
    : null;
  const planLabel =
    sub?.plan_key === "pro_weekly"
      ? "Weekly · €1.99"
      : sub?.plan_key === "pro_monthly"
        ? "Monthly · €6.99"
        : "Aloya Pro";

  async function manage() {
    setBusy(true);
    setError(null);
    try {
      const result = await portalFn({
        data: {
          environment: getStripeEnvironment(),
          returnUrl: window.location.href,
        },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-7 text-limestone shadow-[0_18px_60px_-24px_rgba(28,30,26,0.5)]">
      <span className="absolute -right-12 -top-12 size-44 rounded-full bg-aegean-aqua/30 blur-2xl" />
      <span className="absolute -left-10 bottom-0 size-32 rounded-full bg-ochre-sun/30 blur-3xl" />

      <div className="relative">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ochre-sun">
          Aloya Pro · Active
        </p>
        <p className="mt-3 font-display text-[1.7rem] leading-[1.05]">
          Every feature unlocked.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-y-3 font-mono text-[11px] uppercase tracking-[0.14em] text-limestone/70">
          <dt>Plan</dt>
          <dd className="text-right text-limestone">{planLabel}</dd>
          {sub?.cancel_at_period_end ? (
            <>
              <dt>Ends</dt>
              <dd className="text-right text-limestone">
                {renewsAt?.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </dd>
            </>
          ) : renewsAt ? (
            <>
              <dt>Renews</dt>
              <dd className="text-right text-limestone">
                {renewsAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </dd>
            </>
          ) : null}
          {user?.email && (
            <>
              <dt>Account</dt>
              <dd className="truncate text-right text-limestone">{user.email}</dd>
            </>
          )}
        </dl>

        {error && <p className="mt-4 text-[11px] text-ochre-sun">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button
            onClick={manage}
            disabled={busy}
            className="flex-1 rounded-2xl bg-limestone py-3 text-sm font-medium text-ink disabled:opacity-50"
          >
            {busy ? "Opening…" : "Manage subscription"}
          </button>
          <button
            onClick={signOut}
            className="rounded-2xl bg-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-limestone/80 ring-1 ring-white/15"
          >
            Sign out
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-limestone/50">
          Opens Stripe's billing portal in a new tab.
        </p>
      </div>
    </div>
  );
}
