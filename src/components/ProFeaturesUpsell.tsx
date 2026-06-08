import { useState } from "react";
import { PaywallSheet } from "./PaywallSheet";

/**
 * Combined Pro upsell shown to non-Pro users on the Saved screen.
 * Replaces the two separate blurred ProGate cards (notifications + offline
 * schedules) so the CTA is never truncated and the surface feels intentional.
 */
export function ProFeaturesUpsell() {
  const [open, setOpen] = useState(false);

  const features = [
    {
      k: "01",
      t: "Quiet alerts",
      d: "Boarding, stops, and delays — only when it matters.",
    },
    {
      k: "02",
      t: "Offline timetables",
      d: "The next 7 days of bus schedules, even without signal.",
    },
  ];

  return (
    <>
      <article className="relative overflow-hidden rounded-[28px] bg-card ring-1 ring-line">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aegean/40 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-aegean/15 blur-3xl"
        />
        <div className="relative px-6 py-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            Aloya Pro
          </p>
          <h3 className="mt-2 font-display text-2xl leading-tight text-ink text-balance">
            Ride <span className="italic text-aegean-deep">calmly</span>,
            online or off
          </h3>

          <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {features.map((x) => (
              <li
                key={x.k}
                className="rounded-2xl bg-limestone/60 px-4 py-3 ring-1 ring-line/60"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                  {x.k}
                </p>
                <p className="mt-1 font-display text-lg leading-tight text-ink">
                  {x.t}
                </p>
                <p className="mt-1 text-[12px] text-ink-soft leading-snug">
                  {x.d}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-limestone transition hover:bg-ink/90"
            >
              Unlock from €1.99/wk
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Cancel anytime
            </span>
          </div>
        </div>
      </article>
      <PaywallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
