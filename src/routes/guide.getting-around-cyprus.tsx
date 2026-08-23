import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useI18n } from "@/lib/i18n";
import { CONTENT } from "@/content/getting-around-cyprus";

const CANONICAL = "https://app.aloya.cy/guide/getting-around-cyprus";
const OG_IMAGE = "https://app.aloya.cy/og/og-guide-getting-around.jpg";

const TITLE = "Getting Around Cyprus by Bus — A Practical Guide";
const DESCRIPTION =
  "How to travel Cyprus without a car: intercity coaches between Nicosia, Limassol, Larnaca and Paphos, urban buses in every city, fares, the Motion Bus Card, and live times.";

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
    links: [
      { rel: "canonical", href: CANONICAL },
      { rel: "alternate", hrefLang: "en", href: CANONICAL },
      { rel: "alternate", hrefLang: "el", href: CANONICAL },
      { rel: "alternate", hrefLang: "x-default", href: CANONICAL },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: CONTENT.en.faq.map((f) => ({
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

const POPULAR_ROUTES: {
  from: { en: string; el: string };
  to: { en: string; el: string };
  routeId: string;
  short: string;
  duration: string;
}[] = [
  {
    from: { en: "Nicosia", el: "Λευκωσία" },
    to: { en: "Limassol", el: "Λεμεσός" },
    routeId: "50060011",
    short: "25",
    duration: "1h 10m",
  },
  {
    from: { en: "Larnaca", el: "Λάρνακα" },
    to: { en: "Nicosia", el: "Λευκωσία" },
    routeId: "50070011",
    short: "42",
    duration: "45m",
  },
  {
    from: { en: "Limassol", el: "Λεμεσός" },
    to: { en: "Larnaca", el: "Λάρνακα" },
    routeId: "50040012",
    short: "45",
    duration: "1h 05m",
  },
];

function GuidePage() {
  const { locale } = useI18n();
  const c = CONTENT[locale];

  return (
    <AppShell>
      <article className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <header className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="font-eyebrow text-[11px] uppercase tracking-[0.22em] text-ink/60 hover:text-ink"
          >
            {c.backLabel}
          </Link>
          <LocaleSwitcher />
        </header>

        <p className="font-eyebrow text-[11px] uppercase tracking-[0.26em] text-aegean">
          {c.eyebrowDate}
        </p>
        <h1 className="mt-3 font-display text-[40px] leading-[1.02] tracking-tight text-ink">
          {c.h1Top}
          <span className="block italic text-aegean-deep">{c.h1Bottom}</span>
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink/75">{c.intro}</p>

        <figure className="mt-10 -mx-5 sm:mx-0">
          <img
            src="/og/og-guide-getting-around.jpg"
            alt={c.imgAlt}
            width={1216}
            height={640}
            className="w-full aspect-[1216/640] object-cover"
          />
          <figcaption className="mt-2 px-5 sm:px-0 font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink/45">
            {c.figCaption}
          </figcaption>
        </figure>

        <Section eyebrow="01" title={c.s1Title}>
          {c.s1}
        </Section>

        <Section eyebrow="02" title={c.s2Title}>
          <p>{c.s2Lead}</p>
          <ul className="mt-4 grid grid-cols-1 gap-2 not-prose">
            {POPULAR_ROUTES.map((r) => (
              <li key={r.routeId}>
                <Link
                  to="/route/$routeId"
                  params={{ routeId: r.routeId }}
                  className="group flex items-baseline justify-between border-t border-ink/10 py-4 hover:border-aegean"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink/40">
                      {c.routeWord} {r.short}
                    </span>
                    <span className="font-display text-[20px] tracking-tight text-ink group-hover:text-aegean-deep">
                      {r.from[locale]} <span className="text-ink/40">→</span> {r.to[locale]}
                    </span>
                  </span>
                  <span className="font-eyebrow text-[11px] uppercase tracking-[0.18em] text-ink/55">
                    {r.duration}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[14px] text-ink/65">{c.needPair}</p>
        </Section>

        <Section eyebrow="03" title={c.s3Title}>
          <p>{c.s3Lead}</p>
          <dl className="mt-4 grid grid-cols-1 gap-3 not-prose">
            {c.cities.map(([city, body]) => (
              <div key={city} className="border-t border-ink/10 pt-3">
                <dt className="font-display text-[18px] tracking-tight text-ink">{city}</dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink/70">{body}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section eyebrow="04" title={c.s4Title}>
          {c.s4}
        </Section>

        <Section eyebrow="05" title={c.s5Title}>
          <div className="mt-2 divide-y divide-ink/10">
            {c.faq.map((f) => (
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
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.26em] text-ink/45">
            {c.ctaEyebrow}
          </p>
          <Link
            to="/trips"
            className="mt-3 inline-flex items-baseline gap-3 font-display text-[28px] tracking-tight text-ink hover:text-aegean-deep"
          >
            {c.ctaLabel}
            <span aria-hidden className="text-aegean">
              →
            </span>
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
      <p className="font-eyebrow text-[10px] uppercase tracking-[0.26em] text-ink/40">{eyebrow}</p>
      <h2 className="mt-2 font-display text-[26px] leading-tight tracking-tight text-ink">
        {title}
      </h2>
      <div className="prose mt-4 max-w-none text-[15px] leading-relaxed text-ink/80 [&_p]:mt-3 [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
