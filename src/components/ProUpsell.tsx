import { useState } from "react";
import { PaywallSheet } from "./PaywallSheet";
import { useProSubscription } from "@/lib/usePro";

/**
 * Aloya Pro upsell — editorial, dense, Apple-grade.
 * Layered ink surface with a precise pricing ledger, numeric feature index
 * and a single confident CTA. No icons, no bullets, no gradients-as-decoration.
 */
export function ProUpsellCard() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<"week" | "month">("week");
  const { isPro, loading } = useProSubscription();

  if (loading || isPro) return null;

  const features = [
    { k: "01", t: "Live boarding cues", d: "A quiet ping when your bus is one stop away." },
    { k: "02", t: "Multi-leg routing", d: "Transfers timed by real bus positions, not timetables." },
    { k: "03", t: "Offline timetables", d: "The next 7 days, even out of signal." },
  ];

  return (
    <>
      <article className="relative overflow-hidden rounded-[28px] bg-ink text-limestone ring-1 ring-ink/60 shadow-[0_30px_80px_-40px_oklch(0.22_0.012_110/0.6)]">
        {/* depth layers */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, var(--color-aegean) 22%, transparent) 0%, transparent 55%), radial-gradient(80% 60% at 0% 100%, color-mix(in oklab, var(--color-ochre) 14%, transparent) 0%, transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-limestone/30 to-transparent"
        />

        <div className="relative px-6 pt-6 pb-7">
          {/* eyebrow */}
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-6 bg-limestone/40" />
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-limestone/80">
              Aloya Pro
            </p>
          </div>

          {/* headline */}
          <h3 className="mt-4 font-display text-[30px] leading-[1.02] tracking-tight text-balance">
            Hear your bus arrive.{" "}
            <span className="text-limestone/55">
              Plan transfers. Stay offline.
            </span>
          </h3>

          {/* pricing ledger */}
          <div className="mt-6 grid grid-cols-2 gap-2">
            {([
              { id: "week", price: "€1.99", unit: "per week", foot: "Cancel anytime" },
              { id: "month", price: "€6.99", unit: "per month", foot: "Save 19%" },
            ] as const).map((p) => {
              const active = plan === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlan(p.id)}
                  aria-pressed={active}
                  className={[
                    "group/plan relative rounded-2xl px-4 py-3 text-left transition-all duration-300",
                    active
                      ? "bg-limestone text-ink ring-1 ring-limestone"
                      : "bg-limestone/[0.06] text-limestone ring-1 ring-limestone/15 hover:bg-limestone/[0.10]",
                  ].join(" ")}
                >
                  <p
                    className={[
                      "font-mono text-[9px] uppercase tracking-[0.24em]",
                      active ? "text-ink-soft" : "text-limestone/55",
                    ].join(" ")}
                  >
                    {p.unit}
                  </p>
                  <p className="mt-1 font-display text-[28px] leading-none tabular-nums tracking-[-0.01em]">
                    {p.price}
                  </p>
                  <p
                    className={[
                      "mt-2 font-mono text-[9px] uppercase tracking-[0.2em]",
                      active ? "text-ink-soft" : "text-limestone/55",
                    ].join(" ")}
                  >
                    {p.foot}
                  </p>
                </button>
              );
            })}
          </div>

          {/* feature ledger */}
          <ul className="mt-6 divide-y divide-limestone/10 border-y border-limestone/10">
            {features.map((f) => (
              <li key={f.k} className="grid grid-cols-[auto_1fr] gap-4 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/45 pt-1 tabular-nums">
                  {f.k}
                </span>
                <div>
                  <p className="font-display text-[17px] leading-tight text-limestone">
                    {f.t}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-limestone/55">
                    {f.d}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-limestone px-5 py-3 text-[13px] font-medium tracking-tight text-ink transition hover:bg-limestone/90 active:scale-[0.98]"
            >
              Start {plan === "week" ? "weekly" : "monthly"} — {plan === "week" ? "€1.99" : "€6.99"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/65 underline-offset-4 hover:text-limestone hover:underline"
            >
              What's included
            </button>
          </div>
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
        className="inline-flex items-center gap-2 rounded-full bg-ochre-soft/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ochre ring-1 ring-ochre/40"
      >
        <span>{label}</span>
      </button>
      <PaywallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
