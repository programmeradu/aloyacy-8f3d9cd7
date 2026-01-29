import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowLeft, IconBus, IconArrowUpRight } from "@/components/Icons";
import { useRealtime } from "@/lib/useRealtime";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
import { useEtaStats } from "@/lib/useEtaStats";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getShapeForTripSync, prefetchShapes } from "@/lib/shapes";
import { getStop, getRoute, routeTone } from "@/lib/gtfs";
import { useI18n } from "@/lib/i18n";


export const Route = createFileRoute("/stop/$stopId")({
  head: ({ params }) => {
    const title = `Stop ${params.stopId} — Aloya`;
    const desc = `Live departures, routes and next bus times for stop ${params.stopId} in Cyprus.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `https://aloyacy.lovable.app/stop/${params.stopId}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: `https://aloyacy.lovable.app/stop/${params.stopId}` }],
    };
  },
  component: StopDetail,
});

function StopDetail() {
  const { t } = useI18n();
  const { stopId } = Route.useParams();
  const stop = getStop(stopId);
  const { data: rt, isLoading } = useRealtime();
  const { data: learnedByStop } = useLearnedStatsBulk([stopId]);

  // Route IDs serving this stop right now — fed to ETA v2 stats fetcher.
  const routeIdsHere = useMemo(() => {
    if (!rt) return [] as string[];
    const set = new Set<string>();
    for (const a of rt.arrivals) {
      if (a.stopId === stopId) set.add(a.routeId);
    }
    return Array.from(set);
  }, [rt, stopId]);
  const etaStats = useEtaStats(routeIdsHere);
  useEffect(() => { prefetchShapes(); }, []);

  const departures = useMemo(() => {
    if (!rt) return [];
    const now = Math.floor(Date.now() / 1000);
    const learnedByRoute = learnedByStop?.get(stopId);
    // Distinct upcoming trips at this stop, soonest first.
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
        });
        return { ...a, eta };
      })
      .filter(
        (d): d is typeof d & { eta: SmartEtaV2 } =>
          d.eta != null && d.eta.etaMin <= 180,
      )
      .slice(0, 8);
  }, [rt, stopId, learnedByStop, stop?.agency, etaStats]);


  const center = stop ? { lat: stop.lat, lng: stop.lng } : undefined;

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
          {t("stop.kicker", { code: stop?.code ?? stopId })}
        </span>
        <span className="size-10" />
      </div>

      <header className="px-6 pb-5 animate-rise" style={{ animationDelay: "60ms" }}>
        <h1 className="font-display text-[40px] leading-[1.05] text-ink">
          {stop?.name ?? t("stop.unknown")}
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {stop
            ? `${stop.agency === "IC" ? t("stop.serviceIntercity") : t("stop.serviceUrban")} — ${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`
            : t("stop.notInDataset")}
        </p>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MapPreview
          height="h-56"
          center={center}
          spanKm={2}
          markers={
            stop
              ? ([
                  { lat: stop.lat, lng: stop.lng, kind: "origin", label: stop.name },
                ] as MapMarker[])
              : undefined
          }
          restrictTripIds={departures.map((d) => d.tripId)}
          liveLabel={{
            active: departures.length === 1
              ? t("stop.busesServingOne")
              : t("stop.busesServingN", { n: departures.length }),
            empty: t("stop.noBusesNear"),
          }}
          fitToContent={false}
        />
      </section>

      <section
        className="mt-8 px-6 animate-rise"
        style={{ animationDelay: "180ms" }}
      >
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">{t("stop.departures")}</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {isLoading ? t("stop.loading") : t("stop.liveSmart")}
          </span>
        </div>

        {departures.length === 0 ? (
          <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-line">
            <p className="font-display text-lg text-ink">{t("stop.noUpcomingTitle")}</p>
            <p className="mt-1 text-[12px] text-ink-soft">
              {t("stop.noUpcomingBody")}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl bg-card ring-1 ring-line divide-y divide-line overflow-hidden">
            {departures.map((d, i) => {
              const route = getRoute(d.routeId);
              const accent = freshnessAccent(d.eta.freshness);
              const shifted = d.eta.operatorEtaMin !== d.eta.etaMin;
              return (
                <Link
                  key={d.tripId + d.routeId + i}
                  to="/trip-info/$tripId"
                  params={{ tripId: d.tripId }}
                  search={{ from: stopId }}
                  className="group flex items-center gap-4 p-4 transition-colors hover:bg-limestone-soft/60"
                >
                  <RouteChip
                    code={route?.short ?? "?"}
                    tone={routeTone(d.routeId)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg leading-[1.15] text-ink text-pretty line-clamp-2 break-words">
                      {route?.long ?? t("stop.routeFallback")}
                    </p>

                    <p className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
                      <IconBus className="size-3 shrink-0" />
                      <span className="truncate">{d.eta.blurb}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-display text-3xl leading-none ${
                        i === 0 ? "text-aegean-deep" : "text-ink"
                      }`}
                    >
                      {d.eta.etaMin}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft mt-0.5">
                      {t("stop.minShort")}
                    </p>
                    {shifted && (
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft line-through decoration-1">
                        {t("stop.opShort", { m: d.eta.operatorEtaMin })}
                      </p>
                    )}
                    <p
                      className={`mt-1 font-mono text-[9px] uppercase tracking-[0.2em] ${accent}`}
                    >
                      {d.eta.freshness}
                    </p>
                    {bandIsInformative(d.eta, d.eta.etaMin) && (
                      <p className="mt-1 font-mono text-[9.5px] tracking-[0.04em] text-ink-soft/80">
                        {d.eta.band}
                      </p>
                    )}
                  </div>
                  <span className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-limestone-soft text-ink-soft transition-colors group-hover:bg-aegean-deep group-hover:text-white">
                    <IconArrowUpRight className="size-3.5" />
                  </span>
                </Link>
              );

            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function freshnessAccent(f: SmartEtaV2["freshness"]): string {
  if (f === "live") return "text-aegean-deep";
  if (f === "predicted") return "text-ochre";
  return "text-ink-soft";
}

/** Only show the v2 band when it materially differs from the headline minute. */
function bandIsInformative(v2: SmartEtaV2, headlineMin: number): boolean {
  if (!v2.band.includes("–")) return false;
  // Hide trivial 1-minute spreads (e.g. "7–8 min") next to "8".
  const m = v2.band.match(/^(\d+)–(\d+)/);
  if (!m) return true;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (hi - lo <= 1) return false;
  // Hide when both edges round to the headline (visual noise).
  if (Math.abs(lo - headlineMin) <= 1 && Math.abs(hi - headlineMin) <= 1) return false;
  return true;
}
