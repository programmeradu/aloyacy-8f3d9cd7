import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useProSubscription } from "@/lib/usePro";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({
    meta: [{ title: "Welcome to Pro — Aloya" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const { isPro, loading } = useProSubscription();

  // Light page-level confetti haptic, once.
  useEffect(() => {
    if (isPro && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator).vibrate?.([8, 30, 12]); } catch { /* noop */ }
    }
  }, [isPro]);

  return (
    <AppShell>
      <section className="px-6 pt-10 pb-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ochre-deep">
          Aloya Pro
        </p>
        <h1 className="mt-3 font-serif text-[2.4rem] leading-[1.05] text-ink">
          {isPro ? "You're in." : "Almost there."}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {isPro
            ? "Pro features are unlocked across the app. Multi-leg trips, live boarding cues, push alerts, and offline schedules are now yours."
            : loading || session_id
              ? "Confirming your subscription — this usually takes a couple of seconds."
              : "We didn't see a checkout session. If you completed payment, refresh in a moment."}
        </p>

        <div className="mt-10 flex flex-col gap-2">
          <Link
            to="/trips"
            className="rounded-2xl bg-ink py-4 text-center text-sm font-medium text-limestone"
          >
            Plan a trip
          </Link>
          <Link
            to="/wallet"
            className="rounded-2xl bg-white py-4 text-center text-sm font-medium text-ink ring-1 ring-line"
          >
            Open Wallet
          </Link>
        </div>

        {session_id && (
          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
            Ref · {session_id.slice(-12)}
          </p>
        )}
      </section>
    </AppShell>
  );
}
