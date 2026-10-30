// Static configuration, bilingual copy and SEO metadata for /airport/$code.
// Kept out of the route component so the page file stays presentational.

import { ogImage } from "@/lib/og-url";
import { AIRPORTS, type AirportCode } from "@/lib/airport.functions";
import type { Locale } from "@/lib/i18n";

export const BASE = "https://app.aloya.cy";

/** GTFS stop that fronts each airport terminal. */
export const AIRPORT_STOP: Record<AirportCode, string> = {
  lca: "6117", // "Larnaka Airport"
  pfo: "1813", // "Pafos Airport"
};

export const ALLOWED_AIRPORTS: AirportCode[] = ["lca", "pfo"];

export function isAirportCode(raw: string): raw is AirportCode {
  return ALLOWED_AIRPORTS.includes(raw.toLowerCase() as AirportCode);
}

export function buildAirportFaq(city: string): { q: string; a: string }[] {
  return [
    {
      q: `How do I get from ${city} airport by bus?`,
      a: `Direct intercity coaches (Kapnos) board on the arrivals forecourt to Nicosia, Limassol, Larnaca, Paphos, Ayia Napa and Protaras. Urban-bus options leave from the same stop.`,
    },
    {
      q: `How much does the bus from ${city} airport cost?`,
      a: `From €4 for short hops up to €11 for the longest leg (e.g. Paphos ↔ Larnaca). Children under 6 travel free.`,
    },
    {
      q: `Do the airport coaches run at night?`,
      a: `Yes, the main lines connect overnight flights. The live departures above reflect what is actually running tonight, not just the published timetable.`,
    },
  ];
}

export type AirportCopy = {
  coachKicker: string;
  seatsLeft: (n: number) => string;
  sold: string;
  bookCta: string;
  timetableCta: string;
  pickup: string;
  fromLabel: string;
  emptyTitle: string;
  emptyBody: string;
  notInDataset: string;
  serviceLabel: string;
};

export const AIRPORT_COPY: Record<Locale, AirportCopy> = {
  en: {
    coachKicker: "Direct coach",
    seatsLeft: (n) => `${n} seats`,
    sold: "Sold out",
    bookCta: "Book",
    timetableCta: "Times",
    pickup: "Boards at",
    fromLabel: "from",
    emptyTitle: "No upcoming buses at this stop.",
    emptyBody: "Coaches and local buses will appear here as they're scheduled.",
    notInDataset: "Airport stop not in dataset.",
    serviceLabel: "Airport service",
  },
  el: {
    coachKicker: "Απευθείας υπεραστικό",
    seatsLeft: (n) => `${n} θέσεις`,
    sold: "Εξαντλήθηκαν",
    bookCta: "Κράτηση",
    timetableCta: "Πρόγραμμα",
    pickup: "Επιβίβαση",
    fromLabel: "από",
    emptyTitle: "Δεν υπάρχουν επόμενα λεωφορεία στη στάση.",
    emptyBody: "Υπεραστικά και αστικά λεωφορεία θα εμφανίζονται εδώ.",
    notInDataset: "Η στάση του αεροδρομίου δεν είναι στο σύνολο δεδομένων.",
    serviceLabel: "Υπηρεσία αεροδρομίου",
  },
};

/** Head metadata (title, OG, canonical, JSON-LD) for one airport page. */
export function airportHead(rawCode: string) {
  const code = rawCode.toLowerCase() as AirportCode;
  const a = AIRPORTS[code];
  if (!a) return { meta: [{ title: "Airport · Aloya" }] };
  const title = `${a.name} (${a.iata}) by Bus · Live Coaches & Routes`;
  const description = `Live intercity coach departures from ${a.name} (${a.iata}), plus urban-bus departures from the airport stop. Direct buses to Nicosia, Limassol, Larnaca, Paphos, Ayia Napa and Protaras with real seat availability.`;
  const canonical = `${BASE}/airport/${code}`;
  const og = ogImage("/api/public/og/default");
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonical },
      { property: "og:type", content: "article" },
      { property: "og:image", content: og },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
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
          mainEntity: buildAirportFaq(a.city).map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  };
}
