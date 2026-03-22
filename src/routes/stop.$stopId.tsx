import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { IconArrowLeft } from "@/components/Icons";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { DepartureRow } from "@/components/DepartureRow";
import { SightingButton } from "@/components/SightingButton";
import { useRealtime } from "@/lib/useRealtime";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
import { useEtaStats } from "@/lib/useEtaStats";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getShapeForTripSync, prefetchShapes } from "@/lib/shapes";
import { prefetchHeadsigns, getHeadsignSync, onHeadsignsLoaded } from "@/lib/headsigns";
import { getStop, getRoute } from "@/lib/gtfs";
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
        { property: "og:url", content: `https://app.aloya.cy/stop/${params.stopId}` },
        { property: "og:image", content: "https://app.aloya.cy/og/og-stop.jpg" },
        { property: "og:image:width", content: "1216" },
        { property: "og:image:height", content: "640" },
        { name: "twitter:image", content: "https://app.aloya.cy/og/og-stop.jpg" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: `https://app.aloya.cy/stop/${params.stopId}` }],
    };
  },
  component: StopDetail,
});

function StopDetail() {
  const { t } = useI18n();
  const { stopId } = Route.useParams();
  const stop = getStop(stopId);
  const { data: rt, isLoading, riderConfirmedAge } = useRealtime();
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
  useEffect(() => { prefetchShapes(); prefetchHeadsigns(); }, []);

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
          riderConfirmedAgeSec: riderConfirmedAge.get(a.tripId),
        });
        return { ...a, eta };
      })
      .filter(
        (d): d is typeof d & { eta: SmartEtaV2 } =>
          d.eta != null && d.eta.etaMin <= 180,
      )
      .slice(0, 8);
  }, [rt, stopId, learnedByStop, stop?.agency, etaStats, riderConfirmedAge]);


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

      {/* Ghost-bus banner — surfaces when the soonest departure has no
          fresh GPS. Honest fallback in place of a phantom "live" claim. */}
      {departures.length > 0 && departures[0].eta.tier === "ghost" && (
        <div className="mt-4">
          <StaleFeedBanner variant="ghost-bus" />
        </div>
      )}

      <section
        className="mt-8 px-6 animate-rise"
        style={{ animationDelay: "180ms" }}
      >
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

        {departures.length === 0 ? (
          <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-line">
            <p className="font-display text-lg text-ink">{t("stop.noUpcomingTitle")}</p>
            <p className="mt-1 text-[12px] text-ink-soft">
              {t("stop.noUpcomingBody")}
            </p>
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
    </AppShell>
  );
}
