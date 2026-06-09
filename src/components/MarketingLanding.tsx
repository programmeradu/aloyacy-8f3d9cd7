import { useEffect, useState } from "react";
import heroImg from "@/assets/marketing-hero.jpg";
import { Logo } from "@/components/Logo";

/**
 * Marketing landing — served at https://aloyacy.live/
 * Distinct from the app at https://app.aloyacy.live/
 *
 * Editorial, Mediterranean, no icons, no bullet dots. Designed to feel like a
 * print spread that happens to render in a browser.
 */
export function MarketingLanding() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="min-h-dvh bg-limestone text-ink">
      {/* Top bar — bare wordmark, single CTA */}
      <header className="flex items-center justify-between px-8 pt-7 lg:px-16">
        <Logo />
        <a
          href="https://app.aloyacy.live/"
          className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft underline decoration-ink/15 underline-offset-[6px] transition-colors hover:text-ink"
        >
          Open the app
        </a>
      </header>

      {/* Hero — display type over editorial photo */}
      <section className="px-8 pt-14 pb-20 lg:px-16 lg:pt-24 lg:pb-28">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
              Cyprus — 2026
            </p>
            <h1 className="mt-5 font-display text-[clamp(48px,8vw,112px)] leading-[0.95] tracking-[-0.02em] text-balance">
              The bus,
              <br />
              <span className="italic text-olive-soft">redrawn.</span>
            </h1>
            <p className="mt-8 max-w-xl text-[17px] leading-[1.55] text-ink-soft">
              Aloya is a calm, intelligent navigation system for every bus on
              the island. Nicosia, Limassol, Larnaca, Paphos, Intercity —
              one quiet interface, one accurate ETA, one Motion card to ride.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <a
                href="https://app.aloyacy.live/"
                className="group inline-flex items-center gap-3 rounded-full bg-ink px-6 py-3.5 text-[14px] font-medium tracking-tight text-limestone transition-colors hover:bg-aegean-deep"
              >
                Launch Aloya
                <span
                  aria-hidden
                  className="font-mono text-[11px] tracking-[0.18em] text-limestone/70 transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </a>
              <a
                href="#manifesto"
                className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft underline decoration-ink/15 underline-offset-[6px] transition-colors hover:text-ink"
              >
                Read the manifesto
              </a>
            </div>
          </div>

          <div className="lg:col-span-5">
            <figure className="relative overflow-hidden rounded-[28px] ring-1 ring-line">
              <img
                src={heroImg}
                alt="A bus stop bench overlooking the Aegean at golden hour, with olive trees in the distance."
                className="h-[420px] w-full object-cover lg:h-[560px]"
                loading="eager"
                fetchPriority="high"
              />
              <figcaption className="absolute bottom-4 left-5 right-5 flex items-end justify-between font-mono text-[9px] uppercase tracking-[0.22em] text-limestone/85 mix-blend-screen">
                <span>Plate 01 — Coastal, 17:42</span>
                <span>{mounted ? new Date().getFullYear() : ""}</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Numbers — single horizontal band, typographic only */}
      <section className="border-y border-line/70 bg-card/40">
        <div className="grid grid-cols-2 divide-y divide-line/70 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {[
            { kicker: "Operators", value: "5", caption: "OSEL, EMEL, Zenon, OSYPA, Intercity" },
            { kicker: "Live vehicles", value: "300+", caption: "Streamed, fused, re-snapped to shape" },
            { kicker: "Stops indexed", value: "4,200", caption: "Across the island, both languages" },
            { kicker: "ETA accuracy", value: "±90s", caption: "On routes with rider GPS coverage" },
          ].map((s) => (
            <div key={s.kicker} className="px-8 py-10 lg:px-10 lg:py-14">
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink-soft">
                {s.kicker}
              </p>
              <p className="mt-4 font-display text-[56px] leading-none tracking-[-0.02em] text-ink">
                {s.value}
              </p>
              <p className="mt-3 text-[12px] leading-snug text-ink-soft">{s.caption}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Manifesto — long-form, two columns */}
      <section id="manifesto" className="px-8 py-24 lg:px-16 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
            Manifesto
          </p>
          <h2 className="mt-5 font-display text-[clamp(36px,5vw,64px)] leading-[1.02] tracking-[-0.01em] text-balance">
            Transit deserves the same care
            <span className="italic text-olive-soft"> we give a record sleeve.</span>
          </h2>

          <div className="mt-12 grid gap-10 text-[15.5px] leading-[1.65] text-ink-soft lg:grid-cols-2 lg:gap-14">
            <p>
              Most transit apps inherit a 2009 idiom — coloured pins on a grey
              tile, accordions stacked under a search bar, a chatbot wedged
              into the corner. Aloya throws all of that out. The island is
              quiet, the light is warm, the buses are slow in the best way.
              The interface should feel the same.
            </p>
            <p>
              Under the surface we are obsessive about accuracy. Every ETA is
              fused from operator feeds, rider phones, vehicle history and the
              shape of the road itself. When something disagrees, we surface
              the disagreement instead of hiding it. When we are unsure, we
              say so. Confidence shows up as a band, not a number pretending
              to be a fact.
            </p>
            <p>
              Aloya is bilingual by default — English and Greek share equal
              weight, never as a flag in a dropdown but as the texture of the
              whole product. It runs on the Motion card you already carry. It
              opens offline. It will never ask you to sign up to plan a trip.
            </p>
            <p>
              We are building the calmest navigation system the Mediterranean
              has ever had, because that is what this place is owed.
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA — full bleed, restrained */}
      <section className="border-t border-line/70 bg-ink text-limestone">
        <div className="px-8 py-24 lg:px-16 lg:py-32">
          <div className="mx-auto flex max-w-5xl flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-limestone/55">
                Ready when you are
              </p>
              <h2 className="mt-5 font-display text-[clamp(40px,6vw,80px)] leading-[1.0] tracking-[-0.02em]">
                Catch the next bus,
                <br />
                <span className="italic text-aegean-soft">beautifully.</span>
              </h2>
            </div>
            <a
              href="https://app.aloyacy.live/"
              className="group inline-flex items-center gap-3 self-start rounded-full bg-limestone px-7 py-4 text-[14px] font-medium tracking-tight text-ink transition-colors hover:bg-aegean-soft"
            >
              Open app.aloyacy.live
              <span
                aria-hidden
                className="font-mono text-[11px] tracking-[0.18em] text-ink/60 transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </a>
          </div>

          <footer className="mx-auto mt-24 flex max-w-5xl flex-wrap items-center justify-between gap-6 border-t border-limestone/15 pt-8 font-mono text-[10px] uppercase tracking-[0.24em] text-limestone/55">
            <span>Aloya — Lefkosia, Cyprus</span>
            <span className="flex gap-6">
              <a href="https://app.aloyacy.live/privacy" className="hover:text-limestone">
                Privacy
              </a>
              <a href="https://app.aloyacy.live/terms" className="hover:text-limestone">
                Terms
              </a>
              <a
                href="https://app.aloyacy.live/guide/getting-around-cyprus"
                className="hover:text-limestone"
              >
                Guide
              </a>
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
