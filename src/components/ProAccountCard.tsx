import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createPortalSession } from "@/lib/billing.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { useProSubscription } from "@/lib/usePro";
import { useAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/i18n";

export function ProAccountCard() {
  const { isPro, sub, loading } = useProSubscription();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portalFn = useServerFn(createPortalSession);

  if (loading || !isPro) return null;

  const renewsAt = sub?.current_period_end
    ? new Date(sub.current_period_end)
    : null;
  const planLabel =
    sub?.plan_key === "pro_weekly"
      ? t("proacc.plan.weekly")
      : sub?.plan_key === "pro_monthly"
        ? t("proacc.plan.monthly")
        : t("proacc.plan.default");

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
      setError(err instanceof Error ? err.message : t("proacc.errPortal"));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const renewLabel = renewsAt
    ? renewsAt.toLocaleDateString(locale === "el" ? "el-GR" : undefined, {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <article className="relative overflow-hidden rounded-2xl bg-ink text-limestone ring-1 ring-ink/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--color-aegean) 22%, transparent) 0%, transparent 55%), radial-gradient(80% 60% at 0% 120%, color-mix(in oklab, var(--color-ochre) 14%, transparent) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-limestone/30 to-transparent"
      />

      <div className="relative px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[11px] font-medium leading-none tracking-[0.14em] text-limestone/70">
            {t("proacc.brand")}<span className="text-ochre">{t("proacc.brand2")}</span>
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-limestone/[0.08] px-2 py-0.5 text-[10px] font-medium tracking-tight text-limestone/80 ring-1 ring-limestone/15">
            <span className="h-1.5 w-1.5 rounded-full bg-aegean" />
            {t("proacc.active")}
          </span>
        </div>

        <p className="mt-3 font-display text-[18px] leading-[1.2] tracking-tight text-limestone">
          {t("proacc.headline")}
        </p>

        <dl className="mt-3 divide-y divide-limestone/10 border-y border-limestone/10 text-[12.5px]">
          <div className="flex items-center justify-between py-2">
            <dt className="text-limestone/55">{t("proacc.plan")}</dt>
            <dd className="text-limestone tabular-nums">{planLabel}</dd>
          </div>
          {renewLabel && (
            <div className="flex items-center justify-between py-2">
              <dt className="text-limestone/55">
                {sub?.cancel_at_period_end ? t("proacc.ends") : t("proacc.renews")}
              </dt>
              <dd className="text-limestone tabular-nums">{renewLabel}</dd>
            </div>
          )}
          {user?.email && (
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="shrink-0 text-limestone/55">{t("proacc.account")}</dt>
              <dd
                className="min-w-0 truncate text-right text-limestone"
                title={user.email}
              >
                {user.email}
              </dd>
            </div>
          )}
        </dl>

        {error && <p className="mt-3 text-[11px] text-ochre">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={manage}
            disabled={busy}
            className="flex-1 rounded-full bg-limestone px-4 py-2.5 text-[12.5px] font-medium tracking-tight text-ink transition hover:bg-limestone/90 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? t("proacc.opening") : t("proacc.manage")}
          </button>
          <button
            onClick={signOut}
            className="rounded-full bg-limestone/[0.08] px-4 py-2.5 text-[12.5px] font-medium tracking-tight text-limestone/80 ring-1 ring-limestone/15 transition hover:bg-limestone/[0.12]"
          >
            {t("proacc.signOut")}
          </button>
        </div>
      </div>
    </article>
  );
}
