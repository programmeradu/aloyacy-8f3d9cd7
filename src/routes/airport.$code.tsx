// Airport page — /airport/lca, /airport/pfo
//
// Treats the airport as a stop: shows the Kapnos coach card at the top
// (direct intercity departures with live seats), an optional flight
// pulse, and then the urban-network DepartureRows from the airport's
// GTFS stop — same UI as /stop/$stopId. SEO metadata + JSON-LD kept
// for indexability; the long-form editorial article lives on the
// marketing site, not here.

import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { IconArrowLeft, IconShare } from "@/components/Icons";
import { DepartureRow } from "@/components/DepartureRow";
import { SightingButton } from "@/components/SightingButton";
import { ShareSheet } from "@/components/ShareSheet";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { useRealtime } from "@/lib/useRealtime";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
import { useEtaStats } from "@/lib/useEtaStats";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getShapeForTripSync, prefetchShapes } from "@/lib/shapes";
import { prefetchHeadsigns, getHeadsignSync, onHeadsignsLoaded } from "@/lib/headsigns";
import { getStop, getRoute } from "@/lib/gtfs";
import { useI18n, type Locale } from "@/lib/i18n";
import kapnosLogo from "@/assets/kapnos-logo.png.asset.json";
import {
  AIRPORTS,
  getAirportPage,
  type AirportCode,
  type AirportPageData,
  type AirportCoachLine,
  type AirportFlights,
} from "@/lib/airport.functions";

const BASE = "https://app.aloya.cy";

// GTFS stop IDs for the two scheduled Cyprus airports.
const AIRPORT_STOP: Record<AirportCode, string> = {
  lca: "6117", // "Larnaka Airport"
  pfo: "1813", // "Pafos Airport"
};

const ALLOWED: AirportCode[] = ["lca", "pfo"];

function airportQuery(code: AirportCode) {
  return queryOptions({
    queryKey: ["airport-page", code],
    queryFn: () => getAirportPage({ data: { code } }),
    staleTime: 60_000,
  });
}

// FAQ kept for JSON-LD only — the visual article lives on the marketing site.
function buildFaq(city: string): { q: string; a: string }[] {
  return [
    {
      q: `How do I get from ${city} airport by bus?`,
      a: `Direct intercity coaches (Kapnos) board on the arrivals forecourt to Nicosia, Limassol, Larnaca, Paphos, Ayia Napa and Protaras. Live next departures and urban-bus options are shown above.`,
    },
    {
      q: `How much does the bus from ${city} airport cost?`,
      a: `From €4 for short hops up to €11 for the longest leg (e.g. Paphos ↔ Larnaca). Children under 6 travel free.`,
    },
    {
      q: `Do the airport coaches run at night?`,
      a: `Yes — the main lines connect overnight flights. The live departures above reflect what is actually running tonight, not just the published timetable.`,
    },
  ];
}

const COPY: Record<Locale, {
  kicker: (iata: string) => string;
  coachTitle: string;
  coachLead: string;
  coachNone: string;
  seatsLeft: (n: number) => string;
  sold: string;
  bookCta: string;
  timetableCta: string;
  pickup: string;
  fromLabel: string;
  flightTitle: string;
  flightQuiet: string;
  flightLine: (a: number, d: number) => string;
  flightSrc: (s: string) => string;
  arrivalsHead: string;
  departuresHead: string;
  localTitle: string;
  localLive: string;
  localLoading: string;
  localEmptyTitle: string;
  localEmptyBody: string;
  notInDataset: string;
}> = {
  en: {
    kicker: (iata) => `airport · ${iata}`,
    coachTitle: "Direct coaches",
    coachLead: "Kapnos services boarding at arrivals. Live seat counts, deep-link to the operator's checkout.",
    coachNone: "No upcoming Kapnos coaches in the service window.",
    seatsLeft: (n) => `${n} seats`,
    sold: "Sold out",
    bookCta: "Book on Kapnos",
    timetableCta: "Timetable",
    pickup: "Boards at",
    fromLabel: "from",
    flightTitle: "Live at the terminal",
    flightQuiet: "Quiet at the terminal in the next hour.",
    flightLine: (a, d) => `${a} arriving · ${d} departing · next 60 min`,
    flightSrc: (s) => `flights via ${s}`,
    arrivalsHead: "Arrivals",
    departuresHead: "Departures",
    localTitle: "Local buses from the airport stop",
    localLive: "Live · smart ETA",
    localLoading: "Loading…",
    localEmptyTitle: "No upcoming buses at this stop.",
    localEmptyBody: "Try the planner for a coach-first option, or check back closer to your flight.",
    notInDataset: "Airport stop not in dataset.",
  },
  el: {
    kicker: (iata) => `αεροδρόμιο · ${iata}`,
    coachTitle: "Απευθείας υπεραστικά",
    coachLead: "Δρομολόγια Kapnos από τις Αφίξεις. Ζωντανές θέσεις, κράτηση απευθείας στον μεταφορέα.",
    coachNone: "Δεν υπάρχουν επόμενα δρομολόγια Kapnos αυτή τη στιγμή.",
    seatsLeft: (n) => `${n} θέσεις`,
    sold: "Εξαντλήθηκαν",
    bookCta: "Κράτηση στον Kapnos",
    timetableCta: "Πρόγραμμα",
    pickup: "Επιβίβαση",
    fromLabel: "από",
    flightTitle: "Ζωντανά στο τερματικό",
    flightQuiet: "Ήσυχα στο τερματικό την επόμενη ώρα.",
    flightLine: (a, d) => `${a} αφίξεις · ${d} αναχωρήσεις · επόμενα 60′`,
    flightSrc: (s) => `πτήσεις μέσω ${s}`,
    arrivalsHead: "Αφίξεις",
    departuresHead: "Αναχωρήσεις",
    localTitle: "Αστικά λεωφορεία από τη στάση του αεροδρομίου",
    localLive: "Ζωντανά · έξυπνο ETA",
    localLoading: "Φόρτωση…",
    localEmptyTitle: "Δεν υπάρχουν επόμενα λεωφορεία στη στάση.",
    localEmptyBody: "Δοκιμάστε τον σχεδιαστή ή ελέγξτε ξανά πιο κοντά στην πτήση σας.",
    notInDataset: "Η στάση του αεροδρομίου δεν είναι στο σύνολο δεδομένων.",
  },
};

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
    const description = `Live intercity coach departures from ${a.name} (${a.iata}), plus urban-bus departures from the airport stop. Direct buses to Nicosia, Limassol, Larnaca, Paphos, Ayia Napa and Protaras with real seat availability.`;
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
            mainEntity: buildFaq(a.city).map((f) => ({
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
        <div className="px-6 pt-10">
          <p className="font-display text-[22px] text-ink">Couldn't load airport data.</p>
          <p className="mt-2 text-[14px] text-ink-soft">{error.message}</p>
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
        <div className="px-6 pt-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-aegean-deep">
            Not in Cyprus
          </p>
          <h1 className="mt-3 font-display text-[34px] leading-tight text-ink">
            No airport page for "{code}".
          </h1>
          <p className="mt-4 text-[15px] text-ink-soft">
            Try{" "}
            <Link to="/airport/$code" params={{ code: "lca" }} className="underline-offset-4 hover:underline">
              Larnaca (LCA)
            </Link>{" "}
            or{" "}
            <Link to="/airport/$code" params={{ code: "pfo" }} className="underline-offset-4 hover:underline">
              Paphos (PFO)
            </Link>.
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
  const { t } = useI18n();
  const c = COPY[locale];
  const airport = data.airport;
  const stopId = AIRPORT_STOP[airport.code];
  const stop = getStop(stopId);
  const [shareOpen, setShareOpen] = useState(false);

  // --- live urban-bus departures (mirrors /stop/$stopId logic) ---
  const { data: rt, isLoading, riderConfirmedAge } = useRealtime();
  const { data: learnedByStop } = useLearnedStatsBulk([stopId]);
  const routeIdsHere = useMemo(() => {
    if (!rt) return [] as string[];
    const set = new Set<string>();
    for (const a of rt.arrivals) if (a.stopId === stopId) set.add(a.routeId);
    return Array.from(set);
  }, [rt, stopId]);
  const etaStats = useEtaStats(routeIdsHere);
  const [, forceHeadsigns] = useState(0);
  useEffect(() => {
    prefetchShapes();
    prefetchHeadsigns();
    return onHeadsignsLoaded(() => forceHeadsigns((n) => n + 1));
  }, []);

  const departures = useMemo(() => {
    if (!rt) return [];
    const now = Math.floor(Date.now() / 1000);
    const learnedByRoute = learnedByStop?.get(stopId);
    const seen = new Set<string>();
    const here = rt.arrivals
      .filter((a) => a.stopId === stopId && a.arrivalUnix >= now - 30)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
      .filter((a) => (seen.has(a.tripId) ? false : (seen.add(a.tripId), true)));
    return here
      .map((a) => {
        const eta = smartEtaV2({
          stopId,
          arrivals: rt.arrivals,
          vehicles: rt.vehicles,
          nowSec: now,
          agency: stop?.agency,
          segments: etaStats.segments,
          dwells: etaStats.dwells,
          shape: getShapeForTripSync(a.tripId, a.routeId),
          learnedByRoute,
          riderConfirmedAgeSec: riderConfirmedAge.get(a.tripId),
        });
        return { ...a, eta };
      })
      .filter((d): d is typeof d & { eta: SmartEtaV2 } => d.eta != null && d.eta.etaMin <= 180)
      .slice(0, 8);
  }, [rt, stopId, learnedByStop, stop?.agency, etaStats, riderConfirmedAge]);

  const center = stop ? { lat: stop.lat, lng: stop.lng } : { lat: airport.lat, lng: airport.lng };
  const cityName = locale === "el" ? airport.cityEl : airport.city;
  const airportName = locale === "el" ? airport.nameEl : airport.name;

  return (
    <AppShell>
      <div className="px-6 pt-2 pb-4 flex items-center justify-between animate-rise">
        <Link
          to="/"
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {c.kicker(airport.iata)}
        </span>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label={t("share.openLabel")}
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink hover:bg-limestone-soft transition-colors"
        >
          <IconShare className="size-4" />
        </button>
      </div>

      <header className="px-6 pb-5 animate-rise" style={{ animationDelay: "60ms" }}>
        <h1 className="font-display text-[40px] leading-[1.05] text-ink">{airportName}</h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {cityName} — {airport.lat.toFixed(4)}, {airport.lng.toFixed(4)}
        </p>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MapPreview
          height="h-56"
          center={center}
          spanKm={3}
          markers={[
            { lat: airport.lat, lng: airport.lng, kind: "origin", label: airportName },
          ] as MapMarker[]}
          restrictTripIds={departures.map((d) => d.tripId)}
          fitToContent={false}
        />
      </section>

      {/* Flight pulse — compact strip */}
      <FlightPulse flights={data.flights} c={c} />

      {/* Direct coaches (Kapnos) */}
      <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="min-w-0">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-ink-soft">
              01 — intercity
            </span>
            <h2 className="mt-1 font-display text-[22px] sm:text-[26px] leading-[1.1] text-ink">
              {c.coachTitle}
            </h2>
          </div>
          <img
            src={kapnosLogo.url}
            alt="Kapnos"
            className="h-7 w-7 rounded-md object-contain bg-white ring-1 ring-line/60 p-0.5 shrink-0"
            loading="lazy"
          />
        </div>
        <p className="text-[13px] text-ink-soft mb-3">{c.coachLead}</p>

        {data.coachLines.length === 0 ? (
          <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-line">
            <p className="text-[13px] text-ink-soft">{c.coachNone}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.coachLines.map((line) => (
              <CoachLineCard key={`${line.routeId}-${line.destinationCity}`} line={line} iata={airport.iata} c={c} />
            ))}
          </ul>
        )}
      </section>

      {/* Ghost-bus banner for the soonest urban departure */}
      {departures.length > 0 && departures[0].eta.tier === "ghost" && (
        <div className="mt-4">
          <StaleFeedBanner variant="ghost-bus" />
        </div>
      )}

      {/* Local buses from the airport stop — same UI as /stop */}
      <section className="mt-10 px-6 animate-rise" style={{ animationDelay: "220ms" }}>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="min-w-0">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-ink-soft">
              02 — urban
            </span>
            <h2 className="mt-1 font-display text-[22px] sm:text-[26px] leading-[1.1] text-ink">
              {c.localTitle}
            </h2>
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft shrink-0 pb-1">
            {isLoading ? c.localLoading : c.localLive}
          </span>
        </div>

        {!stop ? (
          <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-line">
            <p className="text-[13px] text-ink-soft">{c.notInDataset}</p>
          </div>
        ) : departures.length === 0 ? (
          <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-line">
            <p className="font-display text-lg text-ink">{c.localEmptyTitle}</p>
            <p className="mt-1 text-[12px] text-ink-soft">{c.localEmptyBody}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {departures.map((d, i) => {
              const route = getRoute(d.routeId);
              const isGhost = d.eta.tier === "ghost";
              const headsign = getHeadsignSync(d.tripId, d.routeId);
              return (
                <div key={d.tripId + d.routeId + i}>
                  <DepartureRow
                    tripId={d.tripId}
                    routeId={d.routeId}
                    routeShort={route?.short ?? "?"}
                    routeLong={route?.long ?? ""}
                    headsign={headsign}
                    stopId={stopId}
                    arrivalUnix={d.arrivalUnix}
                    eta={{
                      etaMin: isGhost ? null : d.eta.etaMin,
                      band: d.eta.band,
                      tier: d.eta.tier,
                      confidence: d.eta.confidence,
                      operatorEtaMin: d.eta.operatorEtaMin,
                    }}
                  />
                  {isGhost && stop && (
                    <div className="mt-2 px-1">
                      <SightingButton
                        tripId={d.tripId}
                        routeId={d.routeId}
                        stopId={stopId}
                        lat={stop.lat}
                        lng={stop.lng}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="h-12" />

      {stop && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          ctx={{
            stop: { id: stop.id, code: stop.code, name: airportName, agency: stop.agency },
            routes: Array.from(
              new Map(
                departures
                  .map((d) => getRoute(d.routeId))
                  .filter((r): r is NonNullable<typeof r> => !!r)
                  .map((r) => [r.id, { short: r.short }]),
              ).values(),
            ),
            nextEtaMin: departures[0]?.eta.etaMin ?? null,
            nextHeadsign: departures[0]
              ? getHeadsignSync(departures[0].tripId, departures[0].routeId)
              : null,
            locale,
            url: `${BASE}/airport/${airport.code}`,
          }}
        />
      )}
    </AppShell>
  );
}

function CoachLineCard({
  line,
  iata,
  c,
}: {
  line: AirportCoachLine;
  iata: string;
  c: (typeof COPY)["en"];
}) {
  return (
    <li className="rounded-[24px] bg-card ring-1 ring-line p-4 flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
            {iata} → {line.destinationCity}
          </p>
          <p className="mt-1 font-display text-[22px] leading-tight text-ink truncate">
            {line.destinationCity}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
            {line.rideMin} min
          </p>
          {line.priceFrom ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/65 tabular-nums">
              {c.fromLabel} {line.priceFrom}
            </p>
          ) : null}
        </div>
      </header>

      <ul className="flex flex-col rounded-2xl ring-1 ring-line/60 divide-y divide-line/40">
        {line.nextDepartures.map((d) => {
          const sold = d.seatsAvailable <= 0;
          const low = d.seatsAvailable > 0 && d.seatsAvailable <= 8;
          return (
            <li
              key={`${d.tripId}-${d.depart}`}
              className="flex items-baseline justify-between gap-3 px-3 py-2 font-mono text-[12px] tabular-nums"
            >
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[16px] text-ink">{d.depart}</span>
                <span className="text-ink-soft">→</span>
                <span className="text-ink/80">{d.arrive}</span>
                {d.dayChip ? (
                  <span className="ml-1 text-[9.5px] uppercase tracking-[0.18em] text-ochre-deep">
                    {d.dayChip}
                  </span>
                ) : null}
              </span>
              <span
                className={`text-[9.5px] uppercase tracking-[0.18em] ${
                  sold ? "text-red-700" : low ? "text-ochre-deep" : "text-ink/55"
                }`}
              >
                {sold ? c.sold : c.seatsLeft(d.seatsAvailable)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-ink-soft truncate min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink/40">
            {c.pickup}:
          </span>{" "}
          {line.pickupName}
        </p>
        <div className="flex gap-2 shrink-0">
          <a
            href="https://kapnosairportshuttle.com/timetables"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-card ring-1 ring-line px-3 py-1.5 font-sans text-[12px] font-semibold text-ink hover:ring-aegean/40"
          >
            {c.timetableCta}
          </a>
          <a
            href="https://kapnosairportshuttle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-ink px-3 py-1.5 font-sans text-[12px] font-semibold text-limestone hover:bg-ochre-deep transition-colors"
          >
            {c.bookCta}
          </a>
        </div>
      </div>
    </li>
  );
}

function FlightPulse({
  flights,
  c,
}: {
  flights: AirportFlights;
  c: (typeof COPY)["en"];
}) {
  if (!flights) return null;
  const quiet = flights.arrivalsNext60 === 0 && flights.departuresNext60 === 0;
  return (
    <section className="mt-6 px-6 animate-rise" style={{ animationDelay: "150ms" }}>
      <div className="rounded-3xl bg-aegean-soft/40 px-4 py-3.5 ring-1 ring-line/60">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-aegean-deep">
          {c.flightTitle}
        </p>
        <p className="mt-1 font-display text-[18px] leading-snug text-ink">
          {quiet ? c.flightQuiet : c.flightLine(flights.arrivalsNext60, flights.departuresNext60)}
        </p>
        {!quiet && (flights.arrivals.length > 0 || flights.departures.length > 0) && (
          <details className="mt-2 group [&[open]>summary>span.chev]:rotate-180">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft">
                {c.flightSrc(flights.source)}
              </span>
              <span className="chev font-mono text-[10px] text-ink-soft transition-transform">▾</span>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-5">
              <FlightCol head={c.arrivalsHead} rows={flights.arrivals} />
              <FlightCol head={c.departuresHead} rows={flights.departures} />
            </div>
          </details>
        )}
      </div>
    </section>
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
      <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ink/45">{head}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {rows.length === 0 ? (
          <li className="font-mono text-[11px] text-ink/40">—</li>
        ) : (
          rows.map((r, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums text-ink/80">
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
