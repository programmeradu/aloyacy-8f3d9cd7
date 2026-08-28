// Airport page — /airport/lca, /airport/pfo
//
// Mirrors /stop/$stopId exactly. The airport's GTFS stop drives the
// "Next departures" list; Kapnos intercity coach cards are slotted in
// at the top of that same list (same UI rhythm as a stop page — no
// editorial article, no numbered sections, no flight pulse strip).
// SEO metadata + JSON-LD are kept for indexability only.

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
import { getAirportPage, type AirportCode, type AirportPageData } from "@/lib/airport.functions";
import { CoachLineCard } from "@/components/airport/CoachLineCard";
import { AIRPORT_COPY, AIRPORT_STOP, BASE, airportHead, isAirportCode } from "@/lib/airport-page";

function airportQuery(code: AirportCode) {
  return queryOptions({
    queryKey: ["airport-page", code],
    queryFn: () => getAirportPage({ data: { code } }),
    staleTime: 60_000,
  });
}

export const Route = createFileRoute("/airport/$code")({
  beforeLoad: ({ params }) => {
    if (!isAirportCode(params.code)) throw notFound();
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(airportQuery(params.code.toLowerCase() as AirportCode)),
  head: ({ params }) => airportHead(params.code),
  component: AirportPage,
  errorComponent: AirportErrorState,
  notFoundComponent: AirportNotFoundState,
});

function AirportErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <AppShell>
      <div className="px-6 pt-10">
        <p className="font-display text-[22px] text-ink">Couldn't load airport data.</p>
        <p className="mt-2 text-[14px] text-ink-soft">{error.message}</p>
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-ink px-4 py-2 font-sans text-[13px] font-semibold text-limestone"
        >
          Try again
        </button>
      </div>
    </AppShell>
  );
}

function AirportNotFoundState() {
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
          <Link
            to="/airport/$code"
            params={{ code: "lca" }}
            className="underline-offset-4 hover:underline"
          >
            Larnaca (LCA)
          </Link>{" "}
          or{" "}
          <Link
            to="/airport/$code"
            params={{ code: "pfo" }}
            className="underline-offset-4 hover:underline"
          >
            Paphos (PFO)
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
}

function AirportPage() {
  const { code } = Route.useParams();
  const normalized = code.toLowerCase() as AirportCode;
  const { data } = useSuspenseQuery(airportQuery(normalized));
  const { locale } = useI18n();
  return <AirportView data={data} locale={locale} />;
}

function AirportView({ data, locale }: { data: AirportPageData; locale: Locale }) {
  const { t } = useI18n();
  const c = AIRPORT_COPY[locale];
  const airport = data.airport;
  const stopId = AIRPORT_STOP[airport.code];
  const stop = getStop(stopId);
  const [shareOpen, setShareOpen] = useState(false);

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
  const airportName = locale === "el" ? airport.nameEl : airport.name;
  const totalCount = data.coachLines.length + departures.length;

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
          {t("stop.kicker", { code: airport.iata })}
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
          {c.serviceLabel} — {airport.lat.toFixed(4)}, {airport.lng.toFixed(4)}
        </p>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MapPreview
          height="h-56"
          center={center}
          spanKm={2}
          markers={
            [
              { lat: airport.lat, lng: airport.lng, kind: "origin", label: airportName },
            ] as MapMarker[]
          }
          restrictTripIds={departures.map((d) => d.tripId)}
          fitToContent={false}
        />
      </section>

      {departures.length > 0 && departures[0].eta.tier === "ghost" && (
        <div className="mt-4">
          <StaleFeedBanner variant="ghost-bus" />
        </div>
      )}

      <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="min-w-0">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-ink-soft">
              {t("stop.heroEyebrow")}
            </span>
            <h2 className="mt-1 font-display text-[22px] sm:text-[26px] leading-[1.1] text-ink">
              {t("stop.nextDepartures")}
            </h2>
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft shrink-0 pb-1">
            {isLoading ? t("stop.loading") : t("stop.liveSmart")}
          </span>
        </div>

        {totalCount === 0 ? (
          <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-line">
            <p className="font-display text-lg text-ink">{c.emptyTitle}</p>
            <p className="mt-1 text-[12px] text-ink-soft">{c.emptyBody}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.coachLines.map((line) => (
              <CoachLineCard key={`${line.routeId}-${line.destinationCity}`} line={line} c={c} />
            ))}
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
                    routeLong={route?.long ?? t("stop.routeFallback")}
                    headsign={headsign}
                    stopId={stopId}
                    arrivalUnix={d.arrivalUnix}
                    eta={{
                      etaMin: isGhost ? null : d.eta.etaMin,
                      band: d.eta.band,
                      tier: d.eta.tier,
                      confidence: d.eta.confidence,
                      operatorEtaMin: d.eta.operatorEtaMin,
                      pingAgeSec: d.eta.pingAgeSec,
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
