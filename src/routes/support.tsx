import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

const SUPPORT_EMAIL = "hello@aloya.cy";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Why is a bus missing from live tracking?",
    a: "Aloya shows what the operators broadcast. When a vehicle isn't transmitting, we fall back to the published timetable and label the arrival as scheduled rather than live, so you always know how much to trust the number.",
  },
  {
    q: "My arrival time jumped by several minutes. What happened?",
    a: "Live predictions move as the bus moves. Big jumps usually mean the vehicle rejoined the feed after a gap, or traffic changed sharply. The confidence mark next to each time tells you how steady that prediction has been.",
  },
  {
    q: "Location is wrong or the app can't find me.",
    a: "Open your device settings and allow precise location for Aloya. Indoors, GPS drifts by a block or two, stepping outside for a moment usually snaps it back.",
  },
  {
    q: "I'm not getting departure reminders.",
    a: "Reminders need notification permission and are set per trip. Check that notifications are enabled for Aloya in your device settings, then set the reminder again from the trip screen.",
  },
  {
    q: "Does Aloya cost anything?",
    a: "No. Every feature is free, departure reminders, offline timetables, live ETA sharing, multi-leg planning, and journey companion alerts. There is no subscription, no trial, and nothing to cancel.",
  },
  {
    q: "Can I add my Motion card to Google Wallet?",
    a: "Yes, add your card number in the Wallet tab, then tap Add to Google Wallet. Apple Wallet passes are not available yet.",
  },
  {
    q: "Is my travel data private?",
    a: "Live location is only shared while you actively share an ETA or join a group trip, and it stops when the trip ends. See the privacy page for the full detail.",
  },
  {
    q: "Do you cover buses north of the Green Line?",
    a: "No. Aloya is the Republic network. Crossing exists · Ledra Street is the pedestrian checkpoint in the old town, and we name it rather than leave a hole. We do not have north-side GTFS or official hours, so we will not invent them. Open the Green Line page for the rest.",
  },
];

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support & FAQ · Aloya" },
      {
        name: "description",
        content:
          "Answers about live bus tracking, reminders, wallet passes, and privacy, plus how to reach the Aloya team in Cyprus.",
      },
      { property: "og:title", content: "Support & FAQ · Aloya" },
      {
        property: "og:description",
        content: "Help with live tracking, reminders, and your Motion card.",
      },
      { property: "og:url", content: "https://app.aloya.cy/support" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://app.aloya.cy/support" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="font-mono text-[12px] uppercase tracking-[0.18em] text-ink/60 hover:text-ink"
          >
            ← Back
          </Link>
          <LocaleSwitcher />
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-aegean">Help</p>
        <h1 className="mt-2 font-display text-[42px] leading-[1.02] tracking-tight text-ink">
          Support &amp; FAQ
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink/80">
          Most questions are about how live times behave or reminders. If the answer you need isn't
          here, write to us, a person reads every message.
        </p>

        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Aloya%20support`}
          className="mt-6 inline-flex max-w-full items-center gap-3 rounded-full border border-ink/15 bg-white px-5 py-3 transition-colors hover:border-aegean"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            Email
          </span>
          <span className="min-w-0 break-all text-[14px] font-medium text-ink">
            {SUPPORT_EMAIL}
          </span>
        </a>

        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/45">
            Common questions
          </h2>
          <dl className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
            {FAQ.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="font-display text-[20px] leading-snug tracking-tight text-ink">
                  {item.q}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-ink/75">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/45">
            Reporting a problem
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
            Tell us the route number, stop name, and roughly when it happened. That trio is enough
            for us to replay the feed and see exactly what you saw.
          </p>
        </section>

        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/10 pt-6 text-[13px] text-ink/55">
          <Link to="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
            Privacy →
          </Link>
          <Link to="/green-line" className="underline-offset-4 hover:text-ink hover:underline">
            Green Line →
          </Link>
          <Link to="/terms" className="underline-offset-4 hover:text-ink hover:underline">
            Terms →
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
