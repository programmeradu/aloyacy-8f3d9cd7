import { useState } from "react";
import { PaywallSheet } from "./PaywallSheet";
import { useProSubscription } from "@/lib/usePro";

/**
 * Aloya Pro upsell — compact editorial card.
 * Tight vertical rhythm, single confident CTA, no oversized pricing tiles.
 * The full plan ledger lives in the PaywallSheet.
 */
export function ProUpsellCard() {
  const [open, setOpen] = useState(false);
  const { isPro, loading } = useProSubscription();

  if (loading || isPro) return null;

  return (
    <>
      <article className="relative overflow-hidden rounded-2xl bg-ink text-limestone ring-1 ring-ink/60">
        {/* depth */}
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

        <div className="relative flex items-center gap-4 px-4 py-3.5">
          {/* wordmark */}
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-display text-[11px] font-medium leading-none tracking-[0.14em] text-limestone/70">
              Aloya<span className="text-ochre"> Pro</span>
            </p>
            <p className="mt-1.5 font-display text-[17px] leading-[1.15] tracking-tight text-limestone">
              Hear your bus. Plan transfers.{" "}
              <span className="text-limestone/55">Stay offline.</span>
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-limestone/55">
              From <span className="tabular-nums text-limestone/80">€1.99</span>/wk · cancel anytime
            </p>
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full bg-limestone px-4 py-2 text-[12.5px] font-medium tracking-tight text-ink transition hover:bg-limestone/90 active:scale-[0.98]"
          >
            Try Pro
          </button>
        </div>
      </article>
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
        className="inline-flex items-center gap-2 rounded-full bg-ochre-soft/70 px-3 py-1.5 text-[11px] font-medium tracking-tight text-ochre ring-1 ring-ochre/40"
      >
        <span>{label}</span>
      </button>
      <PaywallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
