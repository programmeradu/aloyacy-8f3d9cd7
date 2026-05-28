import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PRO_PLANS, type PlanId, getStripeEnvironment } from "@/lib/billing";
import { useAuth } from "@/lib/useAuth";
import { useProSubscription } from "@/lib/usePro";
import { getDeviceId } from "@/lib/device-id";
import { getTrialEligibility } from "@/lib/trial.functions";
import { AuthSheet } from "./AuthSheet";
import { StripeEmbeddedCheckoutPane } from "./StripeEmbeddedCheckout";
import proHero from "@/assets/pro-hero.jpg";
import { useI18n, type DictKey } from "@/lib/i18n";

const FEATURE_KEYS: { title: DictKey; body: DictKey }[] = [
  { title: "pay.feat.planner.t", body: "pay.feat.planner.b" },
  { title: "pay.feat.boarding.t", body: "pay.feat.boarding.b" },
  { title: "pay.feat.alerts.t", body: "pay.feat.alerts.b" },
  { title: "pay.feat.offline.t", body: "pay.feat.offline.b" },
  { title: "pay.feat.priority.t", body: "pay.feat.priority.b" },
];

export function PaywallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { isPermanent } = useAuth();
  const { isPro } = useProSubscription();
  const [plan, setPlan] = useState<PlanId>("monthly");
  const [authOpen, setAuthOpen] = useState(false);
  const [stage, setStage] = useState<"plan" | "checkout">("plan");
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);

  const eligibilityFn = useServerFn(getTrialEligibility);

  useEffect(() => {
    if (!open || !isPermanent || isPro) {
      setTrialEligible(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await eligibilityFn({
          data: { deviceId: getDeviceId(), environment: getStripeEnvironment() },
        });
        if (!cancelled) setTrialEligible(res.eligible);
      } catch {
        if (!cancelled) setTrialEligible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isPermanent, isPro, eligibilityFn]);

  if (!open) return null;

  function startCheckout() {
    if (!isPermanent) {
      setAuthOpen(true);
      return;
    }
    setStage("checkout");
  }

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/return`
      : "/checkout/return";

  const ctaLabel = !isPermanent
    ? t("pay.continue")
    : trialEligible
      ? "Start 7-day free trial"
      : t("pay.continueCheckout");

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="no-scrollbar max-h-[94dvh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl bg-limestone ring-1 ring-line"
          onClick={(e) => e.stopPropagation()}
        >
          {stage === "plan" ? (
            <>
              {/* Editorial hero */}
              <div className="relative h-56 w-full overflow-hidden">
                <img
                  src={proHero}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-limestone/10 to-limestone" />
                <div className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-white/70 backdrop-blur" />
                <div className="absolute bottom-3 left-6 right-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/80">
                    {t("pay.kicker")}
                  </p>
                </div>
              </div>

              <div className="px-6 pb-10 -mt-2">
                <h2 className="font-display text-[2.1rem] leading-[1.05] tracking-tight text-ink">
                  {t("pay.titleA")}<br />{t("pay.titleB")}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {t("pay.lede")}
                </p>

                <ul className="mt-7 space-y-5">
                  {FEATURE_KEYS.map((f) => (
                    <li key={f.title} className="border-l border-aegean-deep/30 pl-4">
                      <p className="text-sm font-medium text-ink">{t(f.title)}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{t(f.body)}</p>
                    </li>
                  ))}
                </ul>

                {!isPro && trialEligible && (
                  <div className="mt-7 rounded-2xl border border-aegean-deep/25 bg-white/70 px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-display text-[14px] font-semibold tracking-tight text-ink">
                        7 days free, then auto-renews
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                        One per device
                      </p>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                      Card required so Stripe can renew your plan when the trial
                      ends. Cancel anytime before day 7 — you won&rsquo;t be charged.
                    </p>
                  </div>
                )}

                <div className="mt-8 space-y-2">
                  {(Object.keys(PRO_PLANS) as PlanId[]).map((id) => {
                    const p = PRO_PLANS[id];
                    const active = plan === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setPlan(id)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${
                          active ? "border-ink bg-white" : "border-line bg-white"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">{p.label}</p>
                          {"note" in p && p.note && (
                            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-olive">
                              {p.note}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-display text-xl text-ink">{p.price}</p>
                          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                            {p.cadence}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={startCheckout}
                  className="mt-6 w-full rounded-2xl bg-ink py-4 text-sm font-medium text-limestone"
                >
                  {ctaLabel}
                </button>
                <button
                  onClick={onClose}
                  className="mt-2 w-full py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft"
                >
                  {t("pay.later")}
                </button>

                <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-soft/80">
                  {trialEligible
                    ? "Have a promo code? You can enter it on the next step."
                    : t("pay.fine")}
                </p>
              </div>
            </>
          ) : (
            <div className="px-2 pb-6 pt-2">
              <button
                onClick={() => setStage("plan")}
                className="mb-2 px-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft"
              >
                {t("pay.back")}
              </button>
              <StripeEmbeddedCheckoutPane
                planKey={PRO_PLANS[plan].key}
                returnUrl={returnUrl}
              />
            </div>
          )}
        </div>
      </div>

      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title={t("pay.authTitle")}
        subtitle={t("pay.authSubtitle")}
      />
    </>
  );
}
