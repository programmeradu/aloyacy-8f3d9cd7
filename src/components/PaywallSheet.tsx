import { useState } from "react";
import { PRO_PLANS, type PlanId } from "@/lib/billing";
import { useAuth } from "@/lib/useAuth";
import { AuthSheet } from "./AuthSheet";
import { StripeEmbeddedCheckoutPane } from "./StripeEmbeddedCheckout";
import proHero from "@/assets/pro-hero.jpg";

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Multi-leg trip planner",
    body: "Full transfers across Nicosia and intercity routes — door to door.",
  },
  {
    title: "Live boarding cues",
    body: "Voice and haptic the second your bus arrives. Auto-reroute if you miss it.",
  },
  {
    title: "Saved trips & push alerts",
    body: "Delays, disruptions, and the perfect leave-now moment — straight to your phone.",
  },
  {
    title: "Offline schedules",
    body: "The whole network cached. Works underground, on planes, anywhere.",
  },
  {
    title: "Priority data refresh",
    body: "Live positions sync more often. Always the freshest ETAs.",
  },
];

export function PaywallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanId>("monthly");
  const [authOpen, setAuthOpen] = useState(false);
  const [stage, setStage] = useState<"plan" | "checkout">("plan");

  if (!open) return null;

  function startCheckout() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setStage("checkout");
  }

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/return`
      : "/checkout/return";

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
                    Aloya Pro
                  </p>
                </div>
              </div>

              <div className="px-6 pb-10 -mt-2">
                <h2 className="font-display text-[2.1rem] leading-[1.05] tracking-tight text-ink">
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
                {(Object.keys(PRO_PLANS) as PlanId[]).map((id) => {
                  const p = PRO_PLANS[id];
                  const active = plan === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setPlan(id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${
                        active
                          ? "border-ink bg-white"
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

              <button
                onClick={startCheckout}
                className="mt-6 w-full rounded-2xl bg-ink py-4 text-sm font-medium text-limestone"
              >
                {user ? "Continue to checkout" : "Continue"}
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
          ) : (
            <div className="px-2 pb-6 pt-2">
              <button
                onClick={() => setStage("plan")}
                className="mb-2 px-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft"
              >
                ← Back
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
        title="One step before Pro"
        subtitle="We need an email so your subscription works across devices. No password — just a magic link."
      />
    </>
  );
}
