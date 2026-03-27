// Airport landing page — /airport/lca, /airport/pfo
//
// Public, indexable SEO page. Mixes editorial intro, live coach
// departures (Kapnos feed), and an OpenSky flight-pulse snapshot. Built
// for the "Larnaca airport bus to Nicosia" / "Paphos airport to Limassol"
// search intent. Bilingual (en/el). Renders inside AppShell so the
// bottom-nav stays consistent with the rest of the app.

import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  AIRPORTS,
  getAirportPage,
  type AirportCode,
  type AirportPageData,
} from "@/lib/airport.functions";

const BASE = "https://app.aloya.cy";

const COPY: Record<Locale, {
  back: string;
  eyebrow: (city: string) => string;
  h1Top: (city: string) => string;
  h1Bottom: string;
  intro: (city: string) => string;
  liveTitle: string;
  liveQuiet: string;
  liveArrivals: (n: number) => string;
  liveDepartures: (n: number) => string;
  liveStale: string;
  coachTitle: string;
  coachLead: string;
  coachNone: string;
  toLabel: string;
  rideLabel: (m: number) => string;
  fromLabel: string;
  pickupLabel: string;
  bookCta: string;
  practicalTitle: string;
  practicalParas: string[];
  planTitle: string;
  planLead: string;
  planCta: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
  seatsLeft: (n: number) => string;
  sold: string;
  arrivalsHead: string;
  departuresHead: string;
  flightSrc: (src: string) => string;
}> = {
  en: {
    back: "← Aloya",
    eyebrow: (city) => `${city} airport`,
    h1Top: (city) => `Arriving at ${city}`,
    h1Bottom: "without a rental car.",
    intro: (city) =>
      `Every scheduled coach out of ${city} airport, with the next departures live from the operator's own booking system — plus how the airport is moving right now.`,
    liveTitle: "Live now",
    liveQuiet: "Quiet at the terminal in the next hour.",
    liveArrivals: (n) => `${n} arriving in the next hour`,
    liveDepartures: (n) => `${n} departing in the next hour`,
    liveStale: "Flight feed unavailable — coach times below are still live.",
    coachTitle: "Direct coaches",
    coachLead:
      "Direct Kapnos services from outside Arrivals. Live seat counts; we deep-link to the operator's checkout for the actual booking.",
    coachNone:
      "No upcoming Kapnos coaches in the next service window. Try the planner for a city-bus alternative.",
    toLabel: "to",
    rideLabel: (m) => `${m} min ride`,
    fromLabel: "from",
    pickupLabel: "Boards at",
    bookCta: "Book on Kapnos",
    practicalTitle: "The practical bits",
    practicalParas: [
      "Coaches board on the arrivals forecourt — turn left out of the doors. No reservation required if seats are open at the kerb, but pre-booking guarantees one for €1–€2 more.",
      "Pay the driver in cash, tap a card, or tap your Motion Bus Card on connecting urban legs once you reach the city.",
      "Children under 6 ride free. Most coaches accept one large suitcase per passenger at no extra charge.",
    ],
    planTitle: "Going elsewhere?",
    planLead:
      "If your destination isn't a direct coach city, plan a door-to-door route — Aloya stitches the airport coach with the urban network and shows live GPS the whole way.",
    planCta: "Open the planner",
    faqTitle: "Frequently asked",
    faq: [],
    seatsLeft: (n) => `${n} seats`,
    sold: "Sold out",
    arrivalsHead: "Arrivals",
    departuresHead: "Departures",
    flightSrc: (s) => `flights via ${s}`,
  },
  el: {
    back: "← Aloya",
    eyebrow: (city) => `αεροδρόμιο ${city}`,
    h1Top: (city) => `Άφιξη στο ${city}`,
    h1Bottom: "χωρίς αυτοκίνητο.",
    intro: (city) =>
      `Όλα τα προγραμματισμένα υπεραστικά από το αεροδρόμιο ${city}, με τις επόμενες αναχωρήσεις απευθείας από το σύστημα κρατήσεων του μεταφορέα — και πώς κινείται το τερματικό αυτή τη στιγμή.`,
    liveTitle: "Τώρα ζωντανά",
    liveQuiet: "Ήσυχα στο τερματικό την επόμενη ώρα.",
    liveArrivals: (n) => `${n} αφίξεις την επόμενη ώρα`,
    liveDepartures: (n) => `${n} αναχωρήσεις την επόμενη ώρα`,
    liveStale: "Η ροή πτήσεων δεν είναι διαθέσιμη — οι ώρες λεωφορείων παρακάτω είναι ζωντανές.",
    coachTitle: "Απευθείας υπεραστικά",
    coachLead:
      "Απευθείας δρομολόγια Kapnos έξω από τις Αφίξεις. Ζωντανές διαθέσιμες θέσεις· συνδέουμε απευθείας με το ταμείο του μεταφορέα.",
    coachNone:
      "Δεν υπάρχουν επόμενα δρομολόγια Kapnos. Δοκιμάστε τον σχεδιαστή για αστικό λεωφορείο.",
    toLabel: "προς",
    rideLabel: (m) => `${m} λεπτά διαδρομή`,
    fromLabel: "από",
    pickupLabel: "Αναχώρηση από",
    bookCta: "Κράτηση στον Kapnos",
    practicalTitle: "Τα πρακτικά",
    practicalParas: [
      "Τα υπεραστικά επιβιβάζουν στο προαύλιο των αφίξεων — αριστερά από τις πόρτες. Κράτηση δεν είναι απαραίτητη αν υπάρχουν θέσεις, αλλά η προκράτηση εξασφαλίζει θέση με €1–€2 επιπλέον.",
      "Πληρώνετε στον οδηγό μετρητοίς, με κάρτα, ή σκανάρετε τη Motion Bus Card στα αστικά μέσα μόλις φτάσετε στην πόλη.",
      "Παιδιά κάτω των 6 ταξιδεύουν δωρεάν. Τα περισσότερα λεωφορεία δέχονται μία μεγάλη βαλίτσα ανά επιβάτη χωρίς χρέωση.",
    ],
    planTitle: "Άλλος προορισμός;",
    planLead:
      "Αν ο προορισμός σας δεν εξυπηρετείται απευθείας, σχεδιάστε διαδρομή πόρτα-πόρτα — το Aloya συνδυάζει το υπεραστικό με το αστικό δίκτυο και δείχνει ζωντανό GPS όλη τη διαδρομή.",
    planCta: "Άνοιγμα σχεδιαστή",
    faqTitle: "Συχνές ερωτήσεις",
    faq: [],
    seatsLeft: (n) => `${n} θέσεις`,
    sold: "Εξαντλήθηκαν",
    arrivalsHead: "Αφίξεις",
    departuresHead: "Αναχωρήσεις",
    flightSrc: (s) => `πτήσεις μέσω ${s}`,
  },
};

// FAQ — built per airport, per locale, with the city name baked in for SEO.
function buildFaq(city: string, locale: Locale): { q: string; a: string }[] {
  if (locale === "el") {
    return [
      {
        q: `Πώς πάω από το αεροδρόμιο ${city} με λεωφορείο;`,
        a: `Απευθείας υπεραστικά (Kapnos) ξεκινούν από το προαύλιο των αφίξεων προς Λευκωσία, Λεμεσό, Λάρνακα, Πάφο, Αγία Νάπα και Πρωταρά. Δείτε τις επόμενες αναχωρήσεις και κρατήστε θέση εδώ.`,
      },
      {
        q: `Πόσο κοστίζει το λεωφορείο από το αεροδρόμιο ${city};`,
        a: `Από €4 για κοντινές διαδρομές έως €11 για τη μεγαλύτερη διαδρομή (π.χ. Πάφος ↔ Λάρνακα). Παιδιά κάτω των 6 δωρεάν.`,
      },
      {
        q: `Λειτουργούν τα λεωφορεία το βράδυ;`,
        a: `Ναι, οι κύριες γραμμές συνδέονται με νυχτερινές πτήσεις. Οι ζωντανές αναχωρήσεις παραπάνω δείχνουν τι όντως ξεκινά απόψε — όχι το τυπικό πρόγραμμα.`,
      },
    ];
  }
  return [
    {
      q: `How do I get from ${city} airport by bus?`,
      a: `Direct intercity coaches (Kapnos) board on the arrivals forecourt to Nicosia, Limassol, Larnaca, Paphos, Ayia Napa and Protaras. See the next live departures and reserve a seat above.`,
    },
    {
      q: `How much does the bus from ${city} airport cost?`,
      a: `From €4 for short hops up to €11 for the longest leg (e.g. Paphos ↔ Larnaca). Children under 6 travel free.`,
    },
    {
      q: `Do the airport coaches run at night?`,
      a: `Yes — the main lines connect overnight flights. The live departures above reflect what is actually running tonight, not just the published timetable.`,
    },
    {
      q: `Can I pay on board?`,
      a: `Yes, cash and contactless cards are accepted. Pre-booking via the operator guarantees a seat for €1–€2 more on busy nights.`,
    },
  ];
}

const ALLOWED: AirportCode[] = ["lca", "pfo"];

function airportQuery(code: AirportCode) {
  return queryOptions({
    queryKey: ["airport-page", code],
    queryFn: () => getAirportPage({ data: { code } }),
    staleTime: 60_000,
  });
}

export const Route = createFileRoute("/airport/$code")({
  beforeLoad: ({ params }) => {
    const lower = params.code.toLowerCase();
    if (!ALLOWED.includes(lower as AirportCode)) throw notFound();
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      airportQuery(params.code.toLowerCase() as AirportCode),
    ),
  head: ({ params }) => {
    const code = params.code.toLowerCase() as AirportCode;
    const a = AIRPORTS[code];
    if (!a) return { meta: [{ title: "Airport — Aloya" }] };
    const title = `${a.name} (${a.iata}) by Bus — Live Coaches & Routes`;
    const description = `Live intercity coach departures from ${a.name} (${a.iata}). Direct buses to Nicosia, Limassol, Larnaca, Paphos, Ayia Napa and Protaras, with real seat availability.`;
    const canonical = `${BASE}/airport/${code}`;
    const og = `${BASE}/og/og-airport-${code}.jpg`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { property: "og:type", content: "article" },
        { property: "og:image", content: og },
        { property: "og:image:width", content: "1216" },
        { property: "og:image:height", content: "640" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: og },
      ],
      links: [
        { rel: "canonical", href: canonical },
        { rel: "alternate", hrefLang: "en", href: canonical },
        { rel: "alternate", hrefLang: "el", href: canonical },
        { rel: "alternate", hrefLang: "x-default", href: canonical },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Airport",
            name: a.name,
            iataCode: a.iata,
            icaoCode: a.icao,
            url: canonical,
            geo: { "@type": "GeoCoordinates", latitude: a.lat, longitude: a.lng },
            addressCountry: "CY",
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: buildFaq(a.city, "en").map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    };
  },
  component: AirportPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-5 pt-10">
          <p className="font-display text-[22px] text-ink">
            Couldn't load airport data.
          </p>
          <p className="mt-2 text-[14px] text-ink/65">{error.message}</p>
          <button
            type="button"
            onClick={() => { router.invalidate(); reset(); }}
            className="mt-6 rounded-full bg-ink px-4 py-2 font-sans text-[13px] font-semibold text-limestone"
          >
            Try again
          </button>
        </div>
      </AppShell>
    );
  },
  notFoundComponent: () => {
    const { code } = Route.useParams();
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-5 pt-10">
          <p className="font-eyebrow text-[11px] uppercase tracking-[0.26em] text-aegean">
            Not in Cyprus
          </p>
          <h1 className="mt-3 font-display text-[34px] leading-tight text-ink">
            We don't have an airport page for "{code}".
          </h1>
          <p className="mt-4 text-[15px] text-ink/70">
            Cyprus has two scheduled airports — try{" "}
            <Link to="/airport/$code" params={{ code: "lca" }} className="underline-offset-4 hover:underline">
              Larnaca (LCA)
            </Link>{" "}
            or{" "}
            <Link to="/airport/$code" params={{ code: "pfo" }} className="underline-offset-4 hover:underline">
              Paphos (PFO)
            </Link>
            .
          </p>
        </div>
      </AppShell>
    );
  },
});

function AirportPage() {
  const { code } = Route.useParams();
  const normalized = code.toLowerCase() as AirportCode;
  const { data } = useSuspenseQuery(airportQuery(normalized));
  const { locale } = useI18n();
  return <AirportView data={data} locale={locale} />;
}

function AirportView({ data, locale }: { data: AirportPageData; locale: Locale }) {
  const c = COPY[locale];
  const a = data.airport;
  const city = locale === "el" ? a.cityEl : a.city;
  const faq = buildFaq(city, locale);
  const flights = data.flights;

  return (
    <AppShell>
      <article className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <header className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="font-eyebrow text-[11px] uppercase tracking-[0.22em] text-ink/60 hover:text-ink"
          >
            {c.back}
          </Link>
          <LocaleSwitcher />
        </header>

        <p className="font-eyebrow text-[11px] uppercase tracking-[0.26em] text-aegean">
          {c.eyebrow(city)} · {a.iata}
        </p>
        <h1 className="mt-3 font-display text-[40px] leading-[1.02] tracking-tight text-ink">
          {c.h1Top(city)}
          <span className="block italic text-aegean-deep">{c.h1Bottom}</span>
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink/75">
          {c.intro(city)}
        </p>

        <figure className="mt-10 -mx-5 sm:mx-0">
          <img
            src={`/og/og-airport-${a.code}.jpg`}
            alt={`${a.name} arrivals forecourt at golden hour`}
            width={1216}
            height={640}
            className="w-full aspect-[1216/640] object-cover"
          />
        </figure>

        {/* Live now — flight pulse */}
        <Section eyebrow="01" title={c.liveTitle}>
          {flights ? (
            flights.arrivalsNext60 === 0 && flights.departuresNext60 === 0 ? (
              <p className="text-[14px] text-ink/65">{c.liveQuiet}</p>
            ) : (
              <>
                <p className="font-display text-[22px] leading-snug text-ink">
                  {c.liveArrivals(flights.arrivalsNext60)}
                  <span className="text-ink/35"> / </span>
                  {c.liveDepartures(flights.departuresNext60)}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-6 not-prose">
                  <FlightCol head={c.arrivalsHead} rows={flights.arrivals} />
                  <FlightCol head={c.departuresHead} rows={flights.departures} />
                </div>
                <p className="mt-4 font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink/40">
                  {c.flightSrc(flights.source)}
                </p>
              </>
            )
          ) : (
            <p className="text-[14px] text-ink/65">{c.liveStale}</p>
          )}
        </Section>

        {/* Coach lines */}
        <Section eyebrow="02" title={c.coachTitle}>
          <p>{c.coachLead}</p>
          {data.coachLines.length === 0 ? (
            <p className="mt-4 text-[14px] text-ink/65">{c.coachNone}</p>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-0 not-prose">
              {data.coachLines.map((line) => (
                <li key={`${line.routeId}-${line.destinationCity}`} className="border-t border-ink/10 py-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink/40">
                        {a.iata} <span className="text-ink/30">→</span> {line.destinationCity}
                      </p>
                      <p className="mt-1 font-display text-[22px] leading-tight tracking-tight text-ink">
                        {line.destinationCity}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-eyebrow text-[10px] uppercase tracking-[0.18em] text-ink/55">
                        {c.rideLabel(line.rideMin)}
                      </p>
                      {line.priceFrom ? (
                        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/65 tabular-nums">
                          {c.fromLabel} {line.priceFrom}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <ul className="mt-3 flex flex-col gap-1.5">
                    {line.nextDepartures.map((d) => {
                      const sold = d.seatsAvailable <= 0;
                      const low = d.seatsAvailable > 0 && d.seatsAvailable <= 8;
                      return (
                        <li
                          key={`${d.tripId}-${d.depart}`}
                          className="flex items-baseline justify-between gap-3 font-mono text-[12px] tabular-nums text-ink/80"
                        >
                          <span>
                            <span className="text-ink">{d.depart}</span>
                            <span className="text-ink/35"> → </span>
                            <span className="text-ink/80">{d.arrive}</span>
                            {d.dayChip ? (
                              <span className="ml-2 font-eyebrow text-[9.5px] uppercase tracking-[0.18em] text-ochre-deep">
                                {d.dayChip}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={
                              sold
                                ? "text-red-700 font-eyebrow text-[9.5px] uppercase tracking-[0.18em]"
                                : low
                                  ? "text-ochre-deep font-eyebrow text-[9.5px] uppercase tracking-[0.18em]"
                                  : "text-ink/45 font-eyebrow text-[9.5px] uppercase tracking-[0.18em]"
                            }
                          >
                            {sold ? c.sold : c.seatsLeft(d.seatsAvailable)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <p className="text-[12px] text-ink/55 truncate">
                      <span className="font-eyebrow uppercase tracking-[0.18em] text-ink/40">
                        {c.pickupLabel}:
                      </span>{" "}
                      {line.pickupName}
                    </p>
                    <a
                      href="https://kapnosairportshuttle.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-aegean-deep hover:text-ink"
                    >
                      {c.bookCta} →
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section eyebrow="03" title={c.practicalTitle}>
          {c.practicalParas.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </Section>

        <Section eyebrow="04" title={c.planTitle}>
          <p>{c.planLead}</p>
          <Link
            to="/trips"
            className="mt-4 inline-flex items-baseline gap-3 font-display text-[24px] tracking-tight text-ink hover:text-aegean-deep"
          >
            {c.planCta}
            <span aria-hidden className="text-aegean">→</span>
          </Link>
        </Section>

        <Section eyebrow="05" title={c.faqTitle}>
          <div className="mt-2 divide-y divide-ink/10">
            {faq.map((f) => (
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
      </article>
    </AppShell>
  );
}

function FlightCol({
  head,
  rows,
}: {
  head: string;
  rows: { callsign: string | null; otherAirport: string | null; scheduled: string }[];
}) {
  return (
    <div>
      <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink/45">{head}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {rows.length === 0 ? (
          <li className="font-mono text-[11px] text-ink/40">—</li>
        ) : (
          rows.map((r, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-2 font-mono text-[11.5px] tabular-nums text-ink/80"
            >
              <span className="text-ink">{r.scheduled}</span>
              <span className="text-ink/55 truncate">
                {r.callsign ?? "—"}
                {r.otherAirport ? <span className="text-ink/35"> · {r.otherAirport}</span> : null}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
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
      <p className="font-eyebrow text-[10px] uppercase tracking-[0.26em] text-ink/40">
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
