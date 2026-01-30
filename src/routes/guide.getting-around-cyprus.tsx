import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

const CANONICAL = "https://aloyacy.lovable.app/guide/getting-around-cyprus";
const OG_IMAGE = "https://aloyacy.lovable.app/og/og-guide-getting-around.jpg";

const TITLE = "Getting Around Cyprus by Bus — A Practical Guide";
const DESCRIPTION =
  "How to travel Cyprus without a car: intercity coaches between Nicosia, Limassol, Larnaca and Paphos, urban buses in every city, fares, the Motion Bus Card, and live times.";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can you get around Cyprus without a car?",
    a: "Yes. Intercity coaches connect all four major cities (Nicosia, Limassol, Larnaca, Paphos) several times a day, and every city runs its own urban bus network. For airports there are direct coaches from Larnaca and Paphos to every city. The main gap is rural Troodos villages and the Akamas — for those a taxi or rental is usually faster.",
  },
  {
    q: "How much does a bus ticket cost in Cyprus?",
    a: "Urban single tickets are €1.50. Intercity coaches are €4 for short hops and €7 for the longest legs (e.g. Paphos – Nicosia). A day pass is €5 in most cities. Children, students and pensioners pay reduced fares with the Motion Bus Card.",
  },
  {
    q: "What is the Motion Bus Card?",
    a: "The Motion Bus Card is the island-wide stored-value card accepted on every urban and intercity bus. You can top it up at kiosks, online, or at the driver. Aloya links to your card balance and shows fare deduction in real time when you tap on.",
  },
  {
    q: "Do Cyprus buses run on Sundays?",
    a: "Urban buses run a reduced Sunday timetable in every city. Intercity coaches run a near-full schedule but with longer gaps after 19:00. Aloya's live times reflect the actual day of the week so you always see what is really departing.",
  },
  {
    q: "How long does the bus take from Larnaca Airport to Nicosia?",
    a: "Roughly 45–55 minutes on the direct intercity coach (route 425 / Kapnos), running every 30–60 minutes from outside Arrivals. Larnaca to Limassol takes ~70 minutes, Larnaca to Paphos ~2h15.",
  },
  {
    q: "Are Cyprus buses reliable?",
    a: "Urban services are generally reliable but can run 5–10 minutes late in afternoon traffic. Intercity coaches are very reliable and rarely cancelled. Aloya overlays live GPS on top of the schedule so a late bus shows as late, not on-time.",
  },
];

export const Route = createFileRoute("/guide/getting-around-cyprus")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "article" },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1216" },
      { property: "og:image:height", content: "640" },
      {
        property: "og:image:alt",
        content:
          "An OSEL public bus parked beneath a stone arch in a sun-bleached Cypriot village at golden hour.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          image: OG_IMAGE,
          datePublished: "2026-06-09",
          dateModified: "2026-06-09",
          author: { "@type": "Organization", name: "Aloya" },
          publisher: { "@type": "Organization", name: "Aloya" },
          mainEntityOfPage: CANONICAL,
        }),
      },
    ],
  }),
  component: GuidePage,
});

const POPULAR_ROUTES: { from: string; to: string; routeId: string; short: string; duration: string }[] = [
  { from: "Nicosia", to: "Limassol", routeId: "50060011", short: "25", duration: "1h 10m" },
  { from: "Larnaca", to: "Nicosia", routeId: "50070011", short: "42", duration: "45m" },
  { from: "Limassol", to: "Larnaca", routeId: "50040012", short: "45", duration: "1h 05m" },
];

function GuidePage() {
  return (
    <AppShell>
      <article className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <header className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/60 hover:text-ink"
          >
            ← Aloya
          </Link>
          <LocaleSwitcher />
        </header>

        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-aegean">
          A guide / 06.2026
        </p>
        <h1 className="mt-3 font-display text-[40px] leading-[1.02] tracking-tight text-ink">
          Getting around Cyprus
          <span className="block italic text-aegean-deep">without a car.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink/75">
          {DESCRIPTION}
        </p>

        <figure className="mt-10 -mx-5 sm:mx-0">
          <img
            src="/og/og-guide-getting-around.jpg"
            alt="An OSEL public bus parked beneath a stone arch in a sun-bleached Cypriot village at golden hour."
            width={1216}
            height={640}
            className="w-full aspect-[1216/640] object-cover"
          />
          <figcaption className="mt-2 px-5 sm:px-0 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">
            Inland Cyprus, late afternoon. OSEL urban bus on a village turnaround.
          </figcaption>
        </figure>

        <Section eyebrow="01" title="The shape of the network">
          <p>
            Cyprus has two layers of public bus. <strong>Intercity coaches</strong> stitch
            the four major cities together — Nicosia, Limassol, Larnaca and Paphos — with a
            handful of routes that double as the country's spine. <strong>Urban buses</strong>
            then fan out inside each city. There is no national rail, so the bus is, in
            practice, how you cross the island without a car.
          </p>
          <p>
            All schedules are GTFS-published, which means live tracking, accurate stop
            sequences, and proper routing are possible. Aloya is built directly on those
            feeds, plus rider GPS for the segments operators don't report.
          </p>
        </Section>

        <Section eyebrow="02" title="Popular intercity legs">
          <p>The three workhorse routes most visitors actually use:</p>
          <ul className="mt-4 grid grid-cols-1 gap-2 not-prose">
            {POPULAR_ROUTES.map((r) => (
              <li key={r.routeId}>
                <Link
                  to="/route/$routeId"
                  params={{ routeId: r.routeId }}
                  className="group flex items-baseline justify-between border-t border-ink/10 py-4 hover:border-aegean"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
                      Route {r.short}
                    </span>
                    <span className="font-display text-[20px] tracking-tight text-ink group-hover:text-aegean-deep">
                      {r.from} <span className="text-ink/40">→</span> {r.to}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/55">
                    {r.duration}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[14px] text-ink/65">
            Need a different pair?{" "}
            <Link to="/trips" className="underline-offset-4 hover:text-aegean-deep hover:underline">
              Open the planner
            </Link>{" "}
            and search door-to-door.
          </p>
        </Section>

        <Section eyebrow="03" title="Urban buses, by city">
          <p>
            Each city runs its own operator and its own livery. The fare, the card and the
            app behaviour are the same.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 not-prose">
            {[
              ["Nicosia", "OSEL — blue & yellow. Hub: Solomos Square."],
              ["Limassol", "EMEL — green & white. Hub: New Port / Anexartisias."],
              ["Larnaca", "Zenon — orange & white. Hub: Finikoudes seafront."],
              ["Paphos", "OSYPA — green & yellow. Hub: Karavella station."],
            ].map(([city, body]) => (
              <div key={city} className="border-t border-ink/10 pt-3">
                <dt className="font-display text-[18px] tracking-tight text-ink">{city}</dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink/70">{body}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section eyebrow="04" title="Fares, in one paragraph">
          <p>
            Urban single: <strong>€1.50</strong>. Urban day pass: <strong>€5</strong>.
            Intercity short hop: <strong>€4</strong>. Longest intercity leg:{" "}
            <strong>€7</strong>. Pay the driver in cash, tap a Motion Bus Card, or pay
            in-app. Children under 6 ride free. Students and pensioners get ~30% off with
            a registered card.
          </p>
        </Section>

        <Section eyebrow="05" title="Frequently asked">
          <div className="mt-2 divide-y divide-ink/10">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none font-display text-[17px] leading-snug tracking-tight text-ink marker:hidden">
                  <span className="inline-block w-4 font-mono text-aegean">+</span>
                  {f.q}
                </summary>
                <p className="mt-3 pl-4 text-[14px] leading-relaxed text-ink/75">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        <div className="mt-16 border-t border-ink/15 pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-ink/45">
            Plan a real trip
          </p>
          <Link
            to="/trips"
            className="mt-3 inline-flex items-baseline gap-3 font-display text-[28px] tracking-tight text-ink hover:text-aegean-deep"
          >
            Open the planner
            <span aria-hidden className="text-aegean">→</span>
          </Link>
        </div>
      </article>
    </AppShell>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-ink/40">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-display text-[26px] leading-tight tracking-tight text-ink">
        {title}
      </h2>
      <div className="prose mt-4 max-w-none text-[15px] leading-relaxed text-ink/80 [&_p]:mt-3 [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
