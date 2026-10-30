import { createFileRoute, Link } from "@tanstack/react-router";
import { assertAdminPage } from "@/lib/admin.functions";

export const Route = createFileRoute("/internal/funding/")({
  // Internal surface: 404 for anyone who is not an admin (see src/lib/admin.functions.ts).
  beforeLoad: () => assertAdminPage(),
  head: () => ({
    meta: [
      { title: "Aloya · Funding & Positioning (Internal)" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal funding strategy and roadmap for Aloya." },
    ],
  }),
  component: FundingLanding,
});

function Section({ children }: { children: React.ReactNode }) {
  return <section className="max-w-[860px] mx-auto px-6 md:px-10">{children}</section>;
}

function Row({ k, a, b, c }: { k: string; a: string; b: string; c: string }) {
  return (
    <div className="grid grid-cols-12 gap-4 py-4 border-t border-line">
      <div className="col-span-12 md:col-span-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
        {k}
      </div>
      <div className="col-span-4 md:col-span-3 font-display text-lg text-ink">{a}</div>
      <div className="col-span-4 md:col-span-2 text-sm text-ink">{b}</div>
      <div className="col-span-4 md:col-span-4 text-sm text-ink-soft">{c}</div>
    </div>
  );
}

function FundingLanding() {
  return (
    <div className="min-h-dvh bg-limestone text-ink">
      {/* Hero */}
      <Section>
        <div className="pt-16 md:pt-24 pb-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft mb-6">
            Internal / Funding &amp; Positioning · v1 · Jul 2026
          </div>
          <h1 className="font-display text-[44px] md:text-[68px] leading-[0.95] tracking-[-0.02em]">
            Aloya is the <em className="italic text-aegean-deep">trust layer</em>
            <br />
            for Cyprus public transport.
          </h1>
          <p className="mt-8 text-lg md:text-xl text-ink-soft max-w-[640px] leading-relaxed">
            A rider-facing app that fuses official GTFS-RT with crowdsourced GPS and ML anomaly
            detection to deliver ETAs riders actually believe. The missing citizen-side of the
            national mobility data infrastructure, and the seed of a Mediterranean mobility OS.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/internal/funding/docs"
              className="inline-flex items-center gap-2 rounded-full bg-ink text-limestone px-6 py-3 text-sm font-semibold hover:bg-ink/90 transition"
            >
              Read the positioning doc →
            </Link>
            <a
              href="#instruments"
              className="inline-flex items-center gap-2 rounded-full ring-1 ring-ink/15 px-6 py-3 text-sm font-semibold text-ink hover:bg-white transition"
            >
              Funding instruments
            </a>
          </div>
        </div>
      </Section>

      {/* Thesis */}
      <Section>
        <div className="py-16 border-t border-line">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-ochre mb-4">
            Thesis
          </div>
          <p className="font-display text-2xl md:text-3xl leading-[1.25] tracking-[-0.01em]">
            Cyprus has world-class open transit data and no citizen-facing product that treats it
            with respect. Journey planners exist. <em className="italic">Trust</em> does not. Aloya
            wins the rider by being right when the feed is wrong.
          </p>
        </div>
      </Section>

      {/* Instruments */}
      <div id="instruments" className="bg-white border-y border-line">
        <Section>
          <div className="py-16">
            <div className="flex items-baseline justify-between mb-8">
              <h2 className="font-display text-3xl md:text-4xl tracking-[-0.01em]">
                Real funding options, ranked.
              </h2>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft hidden md:block">
                Non-dilutive first
              </div>
            </div>

            <Row
              k="Now"
              a="RIF Fast Track"
              b="€50 to 150k"
              c="Cyprus-only · ~70% co-funding · 3-month decision · realistic first win"
            />
            <Row
              k="Now"
              a="ESF+ Upskilling"
              b="€30 to 80k"
              c="Human Resource Development Authority (AnAD), train riders + city staff on digital mobility literacy; pairs with an Aloya-in-the-classroom module"
            />
            <Row
              k="Q4 2026"
              a="CEF Digital · MMTIS"
              b="€200 to 500k"
              c="EU consortium bid with UCY/CUT + an operator (OSEL/Motion) around NAP/GTFS-RT quality"
            />
            <Row
              k="2027"
              a="Horizon Cluster 5"
              b="€1 to 3M share"
              c="CIVITAS consortium, join as digital/data partner, not lead"
            />
            <Row
              k="2027"
              a="Interreg Euro-MED"
              b="€150 to 400k"
              c="Cross-border small-island mobility · Cyprus + Malta + Crete/Balearics"
            />
            <Row
              k="After traction"
              a="EIC Accelerator"
              b="€2.5M + €15M eq."
              c="Requires paying users, LOI from Ministry/PTA, international expansion narrative"
            />
          </div>
        </Section>
      </div>

      {/* ESF+ deep pointer */}
      <Section>
        <div className="py-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-ochre mb-4">
            ESF+ · Why it matters for us
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-[-0.01em] mb-6">
            Upskilling grants pay us to teach Cyprus how to ride.
          </h2>
          <p className="text-lg text-ink-soft leading-relaxed max-w-[640px]">
            ESF+ (European Social Fund Plus) funds{" "}
            <strong className="text-ink">people, not products</strong>, digital literacy,
            green-skills training, workforce transition. Aloya qualifies as the
            <em className="italic"> delivery mechanism</em> for a digital-mobility literacy program:
            older riders, tourists, low-income commuters, municipal staff. AnAD (HRDA) administers
            the Cyprus tranche. Typical envelope: €30 to 80k per pilot cohort. It won't build the
            app · it funds the human infrastructure around it, and every trained user is a permanent
            rider.
          </p>
        </div>
      </Section>

      {/* Expansion */}
      <div className="bg-ink text-limestone">
        <Section>
          <div className="py-20">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-ochre mb-6">
              Expansion / What Aloya becomes
            </div>
            <h2 className="font-display text-4xl md:text-5xl tracking-[-0.02em] leading-[1] mb-10">
              The bus is the wedge.
              <br />
              <span className="text-aegean">Mobility is the market.</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-x-12 gap-y-10">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/50 mb-2">
                  V2 · Micromobility
                </div>
                <h3 className="font-display text-2xl mb-2">Bikes, scooters, shared cars.</h3>
                <p className="text-limestone/70 leading-relaxed">
                  Nextbike, Bolt, and Kapnos already integrated as data sources. Promote to
                  first-class legs in the planner. One trust layer across every vehicle in Cyprus.
                </p>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/50 mb-2">
                  V3 · Ferries &amp; airport
                </div>
                <h3 className="font-display text-2xl mb-2">Sea legs, arrivals, transfers.</h3>
                <p className="text-limestone/70 leading-relaxed">
                  Paphos/Larnaca airport shuttles, Kyrenia ferry connections, cruise-day disruption
                  feeds. Tourist arrival → first ride, without the friction.
                </p>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/50 mb-2">
                  V4 · Accessibility OS
                </div>
                <h3 className="font-display text-2xl mb-2">Real-time inclusive routing.</h3>
                <p className="text-limestone/70 leading-relaxed">
                  Wheelchair-verified stops, step-count, low-floor bus detection, audio-first
                  navigation. Fundable under Horizon accessibility calls and CY national inclusion
                  budgets.
                </p>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/50 mb-2">
                  V5 · Regional expansion
                </div>
                <h3 className="font-display text-2xl mb-2">Malta, Crete, Balearics.</h3>
                <p className="text-limestone/70 leading-relaxed">
                  Same problem, same GTFS-RT gap, same tourist-heavy island economics. Aloya as the
                  Mediterranean small-island mobility standard, the EIC narrative.
                </p>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/50 mb-2">
                  V6 · Carbon &amp; MaaS wallet
                </div>
                <h3 className="font-display text-2xl mb-2">Green Deal money.</h3>
                <p className="text-limestone/70 leading-relaxed">
                  Per-trip CO₂ ledger, employer commute subsidies, integrated Motion Pass +
                  micromobility wallet. Unlocks CEF-T Green and municipal SUMP budgets.
                </p>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/50 mb-2">
                  V7 · Rider data commons
                </div>
                <h3 className="font-display text-2xl mb-2">The signal, published back.</h3>
                <p className="text-limestone/70 leading-relaxed">
                  Anonymised reliability signals shared as open data with CyNAP, universities,
                  operators. Positions Aloya as public-interest infrastructure, the moat, and the
                  LOI generator.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* CTA */}
      <Section>
        <div className="py-20 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft mb-4">
            Next
          </p>
          <h2 className="font-display text-3xl md:text-4xl tracking-[-0.01em] mb-6">
            Draft the RIF Fast Track one-pager. Scope the CEF consortium.
          </h2>
          <Link
            to="/internal/funding/docs"
            className="inline-flex items-center gap-2 rounded-full bg-ink text-limestone px-6 py-3 text-sm font-semibold hover:bg-ink/90 transition"
          >
            Open the positioning &amp; roadmap doc →
          </Link>
        </div>
      </Section>

      <footer className="border-t border-line py-8">
        <Section>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft flex justify-between">
            <span>Aloya · Internal</span>
            <span>Not linked from public navigation</span>
          </div>
        </Section>
      </footer>
    </div>
  );
}
