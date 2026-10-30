import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ResumeTripPill } from "@/components/ResumeTripPill";
import { NotchCard } from "@/components/roam/NotchCard";
import { BackButton, FrostButton } from "@/components/roam/FrostButton";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { DepartureRow } from "@/components/DepartureRow";
import { SightingButton } from "@/components/SightingButton";
import { ShareSheet } from "@/components/ShareSheet";
import { StopReliabilityStrip } from "@/components/StopReliabilityStrip";
import { StopCondition } from "@/components/stop/StopCondition";
import { useRealtime } from "@/lib/useRealtime";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
import { useEtaStats } from "@/lib/useEtaStats";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getShapeForTripSync, prefetchShapes } from "@/lib/shapes";
import { prefetchHeadsigns, getHeadsignSync, onHeadsignsLoaded } from "@/lib/headsigns";
import { getStop, getRoute, STOPS } from "@/lib/gtfs";
import { useRoamI18n, type RoamKey } from "@/lib/roam-i18n";
import { openMeSheet } from "@/components/roam/me-store";
import { Icon } from "@/components/roam/Icon";

const STOP_AREA_KEY: Record<string, RoamKey> = {
  NPT: "lines.nicosia",
  LMS: "lines.limassol",
  LCA: "lines.larnaca",
  PFO: "lines.paphos",
  FAM: "lines.famagusta",
  IC: "lines.intercity",
};

/**
 * Who serves this stop. Local stop ids repeat across operator feeds (324 on
 * Makariou is both a Nicosia and an Intercity stop), so list every agency
 * that has this id here, town buses first, instead of the first match.
 */
function stopAreaLine(stopId: string, primary: string, r: (k: RoamKey) => string): string {
  const here = STOPS.filter((s) => s.id === stopId).map((s) => s.agency);
  const agencies = Array.from(new Set([primary, ...here])).sort(
    (a, b) => Number(a === "IC") - Number(b === "IC"),
  );
  return agencies
    .map((a) => (a === "SPC" ? "Pame Express" : STOP_AREA_KEY[a] ? r(STOP_AREA_KEY[a]) : ""))
    .filter(Boolean)
    .join(" · ");
}
import { getStopReliability, aggregateStopReliability } from "@/lib/reliability.functions";
import { getStopRunHints } from "@/lib/headway.functions";
import { lastTonightOnRoute, pickNoShow } from "@aloya/core/no-show";
import { pickHeadwayForDepartures } from "@aloya/core/headway-chance";
import { pickWaitOrBailForDepartures } from "@aloya/core/wait-or-bail";
import { useI18n } from "@/lib/i18n";
import { sampleEtaPrediction } from "@/lib/eta-log";
import { loadStopIndexFacts } from "@/lib/stop-index.server";
import { stopHead } from "@/lib/stop-seo";

export const Route = createFileRoute("/stop/$stopId")({
  loader: ({ params }) => loadStopIndexFacts(params.stopId),
  head: ({ params, loaderData }) => stopHead(params.stopId, loaderData),
  component: StopDetail,
});

function StopDetail() {
  const { t, locale } = useI18n();
  const { r } = useRoamI18n();
  const [shareOpen, setShareOpen] = useState(false);
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const { stopId } = Route.useParams();
  const stop = getStop(stopId);
  const { data: rt, isLoading, riderConfirmedAge, riderConfirmedCount } = useRealtime();
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

  // Wave 1.4 completion — per-stop reliability. Only fetches once we know
  // which routes actually serve this stop, and only when there's at least
  // one candidate. Returns per-route rows that we fold into a single
  // stop-wide score for the hero strip.
  const stopReliabilityFn = useServerFn(getStopReliability);
  const { data: stopReliabilityRows } = useQuery({
    queryKey: ["stopReliability", stopId, routeIdsHere.slice().sort().join(",")],
    queryFn: () => stopReliabilityFn({ data: { stopId, routeIds: routeIdsHere } }),
    enabled: routeIdsHere.length > 0,
    staleTime: 5 * 60_000,
  });
  const stopReliability = useMemo(
    () => (stopReliabilityRows ? aggregateStopReliability(stopReliabilityRows) : null),
    [stopReliabilityRows],
  );

  const runHintsFn = useServerFn(getStopRunHints);
  const { data: runHints } = useQuery({
    queryKey: ["stopRunHints", stopId, routeIdsHere.slice().sort().join(",")],
    queryFn: () => runHintsFn({ data: { routeIds: routeIdsHere, stopId } }),
    enabled: routeIdsHere.length > 0,
    staleTime: 5 * 60_000,
  });
  const noShowSlots = runHints?.slots ?? [];

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
          riderConfirmedSources: riderConfirmedCount.get(a.tripId),
        });
        return { ...a, eta };
      })
      .filter((d): d is typeof d & { eta: SmartEtaV2 } => d.eta != null && d.eta.etaMin <= 180)
      .slice(0, 8);
  }, [rt, stopId, learnedByStop, stop?.agency, etaStats, riderConfirmedAge, riderConfirmedCount]);

  const headwayByTrip = useMemo(() => {
    if (!rt || !runHints) return new Map();
    return pickHeadwayForDepartures(
      departures.map((d) => ({
        tripId: d.tripId,
        routeId: d.routeId,
        arrivalUnix: d.arrivalUnix,
        tier: d.eta.tier,
      })),
      runHints.headways,
      rt.vehicles,
      rt.arrivals,
      stopId,
      Math.floor(Date.now() / 1000),
    );
  }, [rt, runHints, departures, stopId]);

  const waitOrBailByTrip = useMemo(() => {
    const nowMs = Date.now();
    const slots = runHints?.slots ?? [];
    return pickWaitOrBailForDepartures(
      departures.map((d) => ({
        tripId: d.tripId,
        routeId: d.routeId,
        routeShort: getRoute(d.routeId)?.short ?? d.routeId,
        headsign: getHeadsignSync(d.tripId, d.routeId),
        etaMin: d.eta.etaMin,
        tier: d.eta.tier,
      })),
      (row) => {
        const d = departures.find((x) => x.tripId === row.tripId);
        return {
          lastTonight:
            !!rt && !!d && lastTonightOnRoute(rt.arrivals, stopId, d.routeId, d.arrivalUnix),
          noShow: !!d && !!pickNoShow(slots, d.routeId, d.arrivalUnix, nowMs),
        };
      },
    );
  }, [departures, rt, stopId, runHints]);

  useEffect(() => {
    for (const d of departures) {
      sampleEtaPrediction({
        tripId: d.tripId,
        routeId: d.routeId,
        stopId,
        horizonSec: Math.round(d.eta.etaSec),
        p50Sec: Math.round(d.eta.etaSec),
        p25Sec: Math.round(d.eta.lowerSec),
        p90Sec: Math.round(d.eta.upperSec),
        tier: d.eta.tier,
        confidence: d.eta.confidence,
        operatorEtaSec: d.eta.operatorEtaMin * 60,
        learnedBiasSec: Math.round(d.eta.learnedBiasSec),
        surface: "stop-card",
      });
    }
  }, [departures, stopId]);

  const center = stop ? { lat: stop.lat, lng: stop.lng } : undefined;
  const lineChips = Array.from(
    new Map(departures.map((d) => [d.routeId, getRoute(d.routeId)?.short ?? d.routeId])).entries(),
  );
  const shown = lineFilter ? departures.filter((d) => d.routeId === lineFilter) : departures;
  const goHref = stop
    ? `/trips?toLat=${stop.lat}&toLng=${stop.lng}&toLabel=${encodeURIComponent(stop.name)}`
    : "/trips";

  return (
    <div className="roam r-page">
      <div className="r-col">
        <OfflineBanner />
        <div className="r-hero-map r-mapwrap">
          <div className="r-map-fill">
            <MapPreview
              bare
              center={center ? { lat: center.lat - 0.0016, lng: center.lng } : undefined}
              spanKm={1.4}
              markers={
                stop
                  ? ([{ lat: stop.lat, lng: stop.lng, kind: "origin", label: stop.name }] as MapMarker[])
                  : undefined
              }
              restrictTripIds={departures.map((d) => d.tripId)}
              fitToContent={false}
              attribTop="calc(var(--r-safe-top) + 64px)"
            />
          </div>
          <div className="r-shade-top" style={{ height: 150 }} />
          <div className="r-haze r-haze--tr" />
          <header className="r-hero-head">
            <BackButton label={r("back")} />
            <span className="flex-1" />
            <FrostButton icon="bell-simple" label={r("me.alerts")} onClick={() => openMeSheet("alerts")} />
            <FrostButton icon="share-network" label={t("share.openLabel")} onClick={() => setShareOpen(true)} />
          </header>
        </div>

        <NotchCard
          className="r-hero-sheet"
          radius={34}
          shadow="drop-shadow(0 -8px 24px rgba(0,0,0,.16))"
          notches={[
            {
              edge: "top",
              cx: -66,
              width: 100,
              depth: 26,
              dock: (
                <a href={goHref} className="r-fb r-fb--white r-fb--lg" aria-label={r("stop.goHere", { name: stop?.name ?? "" })}>
                  <Icon name="arrow-bend-up-right" />
                </a>
              ),
            },
          ]}
        >
          <div className="px-5 pt-7" style={{ paddingBottom: "calc(var(--r-safe-bottom) + 120px)", minHeight: "calc(100dvh - 304px)" }}>
            <h1 className="r-t1 pr-16">{stop?.name ?? t("stop.unknown")}</h1>
            <p className="r-lbl mt-1.5">
              {t("stop.kicker", { code: stop?.code ?? stopId })}
              {" · "}
              {stop ? stopAreaLine(stopId, stop.agency, r) || t("stop.serviceUrban") : t("stop.notInDataset")}
            </p>

            {lineChips.length > 1 && (
              <div className="r-hscroll mt-4" role="group" aria-label={r("stop.filter")}>
                <button
                  type="button"
                  aria-pressed={lineFilter == null}
                  onClick={() => setLineFilter(null)}
                  className={`r-pill r-pill--lg ${lineFilter == null ? "r-pill--k" : "r-pill--o"}`}
                >
                  {r("lines.all")}
                </button>
                {lineChips.map(([id, short]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={lineFilter === id}
                    onClick={() => setLineFilter(lineFilter === id ? null : id)}
                    className={`r-pill r-pill--lg r-tnum ${lineFilter === id ? "r-pill--k" : "r-pill--o"}`}
                  >
                    {short}
                  </button>
                ))}
              </div>
            )}

            {/* Ghost-bus banner: surfaces when the soonest departure has no
                fresh GPS. Honest fallback in place of a phantom "live" claim. */}
            {departures.length > 0 && departures[0].eta.tier === "ghost" && (
              <div className="r-legacy -mx-5 mt-3">
                <StaleFeedBanner variant="ghost-bus" />
              </div>
            )}

            <div className="mt-4 flex items-baseline justify-between">
              <h2 className="r-t3">{t("stop.nextDepartures")}</h2>
              <span className="r-conf">
                {isLoading ? (
                  <>
                    <span className="r-dot r-dot--grey" />
                    {t("stop.loading")}
                  </>
                ) : (
                  <>
                    <span className="r-dot" />
                    {departures.length === 1
                      ? t("stop.busesServingOne")
                      : departures.length > 1
                        ? t("stop.busesServingN", { n: departures.length })
                        : t("stop.noBusesNear")}
                  </>
                )}
              </span>
            </div>

            {departures.length === 0 ? (
              <div className="mt-3 rounded-[22px] bg-[#f3f3f0] p-5 text-center">
                <p className="r-t3">{t("stop.noUpcomingTitle")}</p>
                <p className="r-lbl mt-1">{t("stop.noUpcomingBody")}</p>
              </div>
            ) : (
              <div className="-mx-3 mt-2">
                {shown.map((d, i) => {
                  const route = getRoute(d.routeId);
                  const isGhost = d.eta.tier === "ghost";
                  const headsign = getHeadsignSync(d.tripId, d.routeId);
                  return (
                    <div key={d.tripId + d.routeId + i}>
                      <DepartureRow
                        variant="roam"
                        first={i === 0 && !lineFilter}
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
                          singleSource: d.eta.singleSource,
                        }}
                        noShow={pickNoShow(noShowSlots, d.routeId, d.arrivalUnix, Date.now())}
                        lastTonight={
                          rt ? lastTonightOnRoute(rt.arrivals, stopId, d.routeId, d.arrivalUnix) : false
                        }
                        headway={headwayByTrip.get(d.tripId) ?? null}
                        waitOrBail={waitOrBailByTrip.get(d.tripId) ?? null}
                        agency={route?.agency}
                      />

                      {isGhost && stop && (
                        <div className="r-legacy px-3 pb-2">
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

            {stopReliability && stopReliability.sampleCount > 0 && (
              <section className="r-legacy -mx-5 mt-5 px-5" aria-label={t("reliability.stopEyebrow")}>
                <StopReliabilityStrip r={stopReliability} />
              </section>
            )}

            <div className="r-legacy -mx-6 mt-3">
              <StopCondition stopId={stopId} />
            </div>
          </div>
        </NotchCard>
      </div>
      <ResumeTripPill />

      {stop && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          ctx={{
            stop: { id: stop.id, code: stop.code, name: stop.name, agency: stop.agency },
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
            url: `https://app.aloya.cy/stop/${stop.id}`,
          }}
        />
      )}
    </div>
  );
}
