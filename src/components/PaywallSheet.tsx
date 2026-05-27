import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createCheckoutSession } from "@/lib/billing.functions";
import { getStripeEnvironment, PRO_PLANS, type PlanId } from "@/lib/billing";
import { useAuth } from "@/lib/useAuth";
import { AuthSheet } from "./AuthSheet";

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Live boarding guidance",
    body: "Voice and haptic cues the second your bus arrives. Auto-reroute if you miss it.",
  },
  {
    title: "Multi-leg trip planner",
    body: "Full transfers across Nicosia and intercity routes — door to door.",
  },
  {
    title: "Saved trips & alerts",
    body: "Push alerts for delays, disruptions, and the perfect leave-now moment.",
  },
  {
    title: "Offline schedules",
    body: "The whole network cached on your phone. Works underground, on planes, anywhere.",
  },
  {
    title: "Priority data refresh",
    body: "Live positions sync more often. Always the freshest ETAs.",
  },
];

export function PaywallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanId>("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const checkoutFn = useServerFn(createCheckoutSession);

  if (!open) return null;

  async function startCheckout() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await checkoutFn({
        data: {
          planKey: PRO_PLANS[plan].key,
          environment: getStripeEnvironment(),
          returnUrl: window.location.href.split("?")[0],
        },
      });
      if ("error" in result) throw new Error(result.error);
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="max-h-[92dvh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl bg-limestone ring-1 ring-line"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 bg-limestone/95 px-6 pt-3 backdrop-blur">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
          </div>

          <div className="px-6 pb-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-deep">
              Aloya Pro
            </p>
            <h2 className="mt-2 font-serif text-[2rem] leading-tight text-ink">
              The whole island,<br />in your pocket.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Aloya stays free for everyday rides. Pro adds the features that turn it
              into a proper navigator — for the cost of two coffees a month.
            </p>

            <ul className="mt-7 space-y-5">
              {FEATURES.map((f) => (
                <li key={f.title} className="border-l border-aegean-deep/30 pl-4">
                  <p className="text-sm font-medium text-ink">{f.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{f.body}</p>
                </li>
              ))}
            </ul>

            <div className="mt-8 space-y-2">
              {(Object.keys(PRO_PLANS) as PlanId[]).map((k) => {
                const p = PRO_PLANS[k];
                const active = plan === k;
                return (
                  <button
                    key={k}
                    onClick={() => setPlan(k)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition ${
                      active
                        ? "border-aegean-deep bg-aegean-soft/40"
                        : "border-line bg-white"
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
                      <p className="font-serif text-xl text-ink">{p.price}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                        {p.cadence}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {error && <p className="mt-3 text-xs text-ochre-deep">{error}</p>}

            <button
              onClick={startCheckout}
              disabled={busy}
              className="mt-6 w-full rounded-2xl bg-ink py-4 text-sm font-medium text-limestone disabled:opacity-50"
            >
              {busy ? "Opening checkout…" : user ? "Go Pro" : "Continue"}
            </button>
            <button
              onClick={onClose}
              className="mt-2 w-full py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft"
            >
              Maybe later
            </button>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-soft/80">
              Cancel anytime. Secure checkout by Stripe. Free features stay free, forever.
            </p>
          </div>
        </div>
      </div>

      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="One step before Pro"
        subtitle="We need an email so your subscription works across devices. No password — just a magic link."
      />
    </>
  );
}
