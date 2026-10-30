import { createFileRoute, Link } from "@tanstack/react-router";
import { assertAdminPage } from "@/lib/admin.functions";

export const Route = createFileRoute("/internal/funding/docs")({
  // Internal surface: 404 for anyone who is not an admin (see src/lib/admin.functions.ts).
  beforeLoad: () => assertAdminPage(),
  head: () => ({
    meta: [
      { title: "Aloya · Positioning & Funding Roadmap (Internal)" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal positioning document and funding roadmap." },
    ],
  }),
  component: FundingDocs,
});

function H2({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2
      id={id}
      className="font-display text-3xl md:text-4xl tracking-[-0.015em] mt-16 mb-6 scroll-mt-24"
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-xl md:text-2xl mt-10 mb-3 text-ink">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[17px] leading-[1.7] text-ink/85 mb-4">{children}</p>;
}

function Pull({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-10 pl-6 border-l-2 border-ochre font-display text-2xl md:text-[28px] leading-[1.3] tracking-[-0.01em] text-ink">
      {children}
    </blockquote>
  );
}

function TocLink({ href, num, label }: { href: string; num: string; label: string }) {
  return (
    <a
      href={href}
      className="group flex gap-4 py-2 border-t border-line hover:bg-limestone-soft transition"
    >
      <span className="font-mono text-[11px] text-ink-soft w-8">{num}</span>
      <span className="text-sm text-ink group-hover:text-aegean-deep">{label}</span>
    </a>
  );
}

function FundingDocs() {
  return (
    <div className="min-h-dvh bg-limestone text-ink">
      <div className="max-w-[860px] mx-auto px-6 md:px-10 py-16 md:py-24">
        {/* Header */}
        <div className="mb-16">
          <Link
            to="/internal/funding"
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft hover:text-ink"
          >
            ← Back to overview
          </Link>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft mt-8 mb-6">
            Internal doc · v1 · Jul 2026 · Not for distribution
          </div>
          <h1 className="font-display text-[42px] md:text-[60px] leading-[0.98] tracking-[-0.02em]">
            Positioning &amp; funding roadmap.
          </h1>
          <p className="mt-6 text-lg text-ink-soft leading-relaxed">
            How Aloya frames itself to grant reviewers, operators, and the Cyprus public sector ·
            and the sequence in which it goes after money.
          </p>
        </div>

        {/* TOC */}
        <div className="mb-16 rounded-2xl bg-white ring-1 ring-line p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft mb-3">
            Contents
          </div>
          <TocLink num="01" href="#positioning" label="Positioning statement" />
          <TocLink num="02" href="#why-fundable" label="Why Aloya is fundable" />
          <TocLink num="03" href="#instruments" label="Instrument-by-instrument playbook" />
          <TocLink num="04" href="#esf" label="ESF+ Upskilling, the ignored lever" />
          <TocLink num="05" href="#verticals" label="Future verticals &amp; roadmap" />
          <TocLink num="06" href="#risks" label="Risks &amp; what will kill a bid" />
          <TocLink num="07" href="#next" label="Next 90 days" />
        </div>

        {/* 01 */}
        <H2 id="positioning">01 · Positioning statement</H2>
        <Pull>
          Aloya is Cyprus's <em className="italic">trust layer</em> for public transport: a
          rider-facing app that fuses official GTFS-RT feeds with crowdsourced GPS signals and ML
          anomaly detection to deliver ETAs riders actually believe. It is the missing citizen-side
          of the national mobility data infrastructure.
        </Pull>
        <P>
          The one-line matters because it does three things at once. It{" "}
          <strong>anchors us as infrastructure</strong> (not a startup toy), it{" "}
          <strong>concedes the operator layer to the operators</strong> (no B2G ambition, we don't
          threaten them), and it <strong>names our defensible surface</strong> (signal fusion, not
          another journey planner).
        </P>
        <P>
          Reviewers of grants, especially Cypriot ones, look for two things: legitimacy and
          non-overlap with existing state products. This sentence gives them both.
        </P>

        {/* 02 */}
        <H2 id="why-fundable">02 · Why Aloya is fundable</H2>
        <P>Four unlocks, and any bid should touch all four:</P>
        <H3>Digital single market (MMTIS / NAP)</H3>
        <P>
          Cyprus is obligated under EU Regulation 2017/1926 to publish real-time transit data
          through its National Access Point (CyNAP). Aloya already consumes those feeds and
          republishes derived signals as open GBFS. We are literally the compliance surface EU
          reviewers care about.
        </P>
        <H3>Green Deal</H3>
        <P>
          Every rider we retain on the bus is a car trip avoided. The CO₂ ledger vertical (V6) turns
          this from rhetoric into a measurable KPI reviewers can score.
        </P>
        <H3>Digital literacy &amp; inclusion</H3>
        <P>
          Aloya is bilingual (EN/EL), works offline, and is being tuned for older riders and
          tourists. This is exactly what ESF+ pays for.
        </P>
        <H3>Cross-border replicability</H3>
        <P>
          The Cypriot GTFS-RT gap is not unique · Malta, Crete, and the Balearics have the same
          shape of problem. This unlocks Interreg Euro-MED and, eventually, EIC.
        </P>

        {/* 03 */}
        <H2 id="instruments">03 · Instrument-by-instrument playbook</H2>

        <H3>RIF Fast Track, start here</H3>
        <P>
          €50 to 150k, Cyprus-only, ~70% co-funding, decisions in ~3 months. This is realistic first
          money. Frame Aloya as an{" "}
          <em>
            AI-fused reliability layer for Cyprus public transport, using rider-crowdsourced signals
            to correct GTFS-RT gaps
          </em>
          . Novelty = signal fusion + anomaly detection. Deliverable = the trust score visible
          in-app + a public dashboard of feed quality per operator. Time-to-submit: 4 to 6 weeks.
        </P>

        <H3>ESF+ Upskilling (AnAD / HRDA)</H3>
        <P>€30 to 80k per cohort. See §04 for the full angle, this is the most overlooked lever.</P>

        <H3>CEF Digital · MMTIS</H3>
        <P>
          €200 to 500k. Directly funds NAP compliance and MMTIS/RTTI data quality. Consortium bid ·
          Aloya as citizen-facing data consumer + quality-signal producer, with UCY or CUT as
          academic lead and OSEL/Motion as operator partner. Time-to-submit: 3 to 4 months once
          consortium is agreed.
        </P>

        <H3>Horizon Europe · Cluster 5 (CIVITAS)</H3>
        <P>
          €1 to 3M as consortium share. Do not lead. Join two-three bids as digital/data partner.
          Very slow, very political, treat as background pipeline.
        </P>

        <H3>Interreg Euro-MED / NEXT MED</H3>
        <P>
          €150 to 400k, small-island cross-border theme. Higher hit rate than Horizon, needs Maltese
          or Greek co-applicant. Ideal 2027 push once V5 is technically real.
        </P>

        <H3>EIC Accelerator</H3>
        <P>
          €2.5M grant + up to €15M equity. ~5% success rate. Prerequisites: paying users, LOI from
          Ministry of Transport or a PTA, defensible tech moat, and a credible international
          expansion narrative. <strong>Not year one.</strong> Realistic window: late 2027.
        </P>

        {/* 04 */}
        <H2 id="esf">04 · ESF+ Upskilling, the ignored lever</H2>
        <Pull>ESF+ funds people. Aloya makes the people. That's the whole pitch.</Pull>
        <P>
          ESF+ (European Social Fund Plus) is the EU's largest people-focused fund. Cyprus's tranche
          is administered by AnAD (Human Resource Development Authority) with periodic open calls
          for training providers and digital-literacy pilots. Most startups ignore it because it
          doesn't fund software.
        </P>
        <P>
          The trick is to <strong>not ask it to fund software</strong>. Ask it to fund the
          <em> curriculum, delivery, and evaluation</em> of a digital-mobility literacy program for
          which Aloya is the training tool. Target cohorts, ranked by fundability:
        </P>
        <ul className="list-none space-y-3 my-6 pl-0">
          {[
            [
              "Older riders (60+)",
              "Highest political priority. Partner with municipal senior centres in Nicosia, Larnaca, Limassol.",
            ],
            [
              "Tourism-industry staff",
              "Hotel concierges, tour operators. Small cohorts, high visibility. Cyprus Tourism Organisation as letter-of-support signer.",
            ],
            [
              "Municipal &amp; transport staff",
              "Bus drivers, dispatchers, city hall clerks. Positions us with operators without threatening them.",
            ],
            [
              "Refugees &amp; migrants",
              "Automatic ESF+ priority. Bilingual EN/EL plus community-language onboarding.",
            ],
          ].map(([who, why]) => (
            <li key={who} className="grid grid-cols-12 gap-4 py-4 border-t border-line">
              <div
                className="col-span-12 md:col-span-4 font-display text-lg"
                dangerouslySetInnerHTML={{ __html: who }}
              />
              <div className="col-span-12 md:col-span-8 text-ink-soft leading-relaxed">{why}</div>
            </li>
          ))}
        </ul>
        <P>
          Bid shape: €30 to 80k per pilot, 6 to 9 months, 60 to 200 trainees, measurable
          digital-skills uplift. Aloya provides the platform (in-kind, valued at cost); grant pays
          for curriculum design, trainer hours, venue, and impact evaluation. Every trained user is
          a permanent Aloya rider and a testimonial for the next bid.
        </P>

        {/* 05 */}
        <H2 id="verticals">05 · Future verticals &amp; roadmap</H2>
        <P>
          The bus is the wedge. Every vertical below has an existing EU funding line attached, which
          is not coincidence, it's how we picked them.
        </P>

        {[
          [
            "V2 · Micromobility",
            "Bikes, scooters, shared cars promoted to first-class legs. Data already flowing via Nextbike, Bolt, Kapnos.",
            "CEF Transport · SUMP grants",
          ],
          [
            "V3 · Ferries & airport transfers",
            "Paphos/Larnaca shuttle intelligence, Kyrenia ferry, cruise-day disruption feeds.",
            "Interreg Euro-MED · Cyprus Tourism Organisation",
          ],
          [
            "V4 · Accessibility OS",
            "Wheelchair-verified stops, low-floor detection, audio-first navigation. Rider-crowdsourced accessibility metadata.",
            "Horizon Cluster 4 · CY national inclusion",
          ],
          [
            "V5 · Regional expansion (Malta, Crete, Balearics)",
            "Same GTFS-RT gap, same island economics. Aloya as Mediterranean small-island mobility standard.",
            "Interreg Euro-MED · EIC narrative unlock",
          ],
          [
            "V6 · Carbon & MaaS wallet",
            "Per-trip CO₂ ledger, employer commute subsidies, Motion Pass + micromobility wallet.",
            "Green Deal · CEF-T · municipal SUMP",
          ],
          [
            "V7 · Rider data commons",
            "Anonymised reliability signals published back to CyNAP, universities, operators.",
            "CEF Digital · Horizon open-data calls",
          ],
        ].map(([title, body, fund]) => (
          <div key={title} className="grid grid-cols-12 gap-4 py-6 border-t border-line">
            <div className="col-span-12 md:col-span-4">
              <h3 className="font-display text-xl text-ink leading-tight">{title}</h3>
            </div>
            <div className="col-span-12 md:col-span-5 text-ink-soft leading-relaxed text-[15px]">
              {body}
            </div>
            <div className="col-span-12 md:col-span-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ochre">
              {fund}
            </div>
          </div>
        ))}

        {/* 06 */}
        <H2 id="risks">06 · Risks &amp; what will kill a bid</H2>
        <P>
          <strong>Overlap perception.</strong> Any hint that Aloya wants to replace Pame, Cyprus
          Bus, or Motion Pass sinks the bid. Positioning must always be additive, the trust layer{" "}
          <em>on top of</em> the state products.
        </P>
        <P>
          <strong>No LOI, no bid.</strong> RIF and CEF both weight letters of support heavily.
          Sequence: informal conversation with Ministry of Transport → user testimonials → formal
          LOI request. Start now, before we need it.
        </P>
        <P>
          <strong>Consortium math.</strong> EU bids fail when a partner underperforms. Cap
          consortium at 3 to 4 partners for first CEF bid. Academic lead handles paperwork; operator
          provides the data narrative; Aloya provides the product; a municipality provides the
          deployment site.
        </P>
        <P>
          <strong>Non-dilutive discipline.</strong> Every hour on an EIC bid is an hour not on a RIF
          bid we could actually win. Stack small wins before chasing the €2.5M number.
        </P>

        {/* 07 */}
        <H2 id="next">07 · Next 90 days</H2>
        <ol className="list-none space-y-4 my-6 pl-0 counter-reset-[step]">
          {[
            [
              "Draft the RIF Fast Track one-pager",
              "Problem, innovation, workplan, budget shape. 4 pages max. Ship in 2 weeks.",
            ],
            [
              "Book one Ministry of Transport coffee",
              "Not a pitch, an update. Ask them what they wish existed.",
            ],
            [
              "Scope the CEF Digital MMTIS consortium",
              "Identify one academic lead (UCY or CUT) and one operator (OSEL preferred).",
            ],
            [
              "Draft the ESF+ senior-riders pilot proposal",
              "Pick one municipality. 60 trainees. €40k envelope. 6 months.",
            ],
            [
              "Publish the reliability dashboard publicly",
              "The proof-of-work that makes every bid credible.",
            ],
          ].map(([title, body], i) => (
            <li key={title} className="grid grid-cols-12 gap-4 py-4 border-t border-line">
              <div className="col-span-2 md:col-span-1 font-mono text-2xl text-ochre">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="col-span-10 md:col-span-11">
                <div className="font-display text-lg text-ink">{title}</div>
                <div className="text-ink-soft text-[15px] leading-relaxed mt-1">{body}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-24 pt-8 border-t border-line font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft flex justify-between">
          <span>End of document</span>
          <Link to="/internal/funding" className="hover:text-ink">
            ↑ Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
