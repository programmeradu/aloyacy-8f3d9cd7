import { useState } from "react";
import { PaywallSheet } from "./PaywallSheet";
import { useProSubscription } from "@/lib/usePro";

export function ProUpsellCard() {
  const [open, setOpen] = useState(false);
  const { isPro, loading } = useProSubscription();

  if (loading || isPro) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-3xl bg-ink px-6 py-7 text-left text-limestone shadow-[0_18px_60px_-24px_rgba(28,30,26,0.5)]"
      >
        <span className="absolute -right-12 -top-12 size-44 rounded-full bg-ochre-sun/30 blur-2xl" />
        <span className="absolute -left-10 bottom-0 size-32 rounded-full bg-aegean-aqua/30 blur-3xl" />

        <span className="relative font-mono text-[10px] uppercase tracking-[0.24em] text-ochre-sun">
          Aloya Pro
        </span>
        <p className="relative mt-3 font-serif text-[1.6rem] leading-[1.05]">
          Hear your bus arrive.<br />
          <span className="text-limestone/70">Plan transfers. Stay offline.</span>
        </p>
        <p className="relative mt-3 text-[12px] leading-relaxed text-limestone/70">
          Live boarding cues, multi-leg routing, push alerts and offline schedules.
          <span className="text-limestone"> €1.99/week</span> or <span className="text-limestone">€6.99/month</span>.
        </p>
        <span className="relative mt-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-sun">
          Explore Pro
          <span aria-hidden>→</span>
        </span>
      </button>
      <PaywallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function GoProInline({ label = "Unlock with Pro" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const { isPro } = useProSubscription();
  if (isPro) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-ochre-sun/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep ring-1 ring-ochre-sun/40"
      >
        <span>{label}</span>
      </button>
      <PaywallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
