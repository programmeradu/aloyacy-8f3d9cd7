import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { IconArrowLeft, IconShare } from "@/components/Icons";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { DepartureRow } from "@/components/DepartureRow";
import { SightingButton } from "@/components/SightingButton";
import { ShareSheet } from "@/components/ShareSheet";
import { useRealtime } from "@/lib/useRealtime";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
import { useEtaStats } from "@/lib/useEtaStats";
import { smartEtaV2, type SmartEtaV2 } from "@/lib/eta-v2";
import { getShapeForTripSync, prefetchShapes } from "@/lib/shapes";
import { prefetchHeadsigns, getHeadsignSync, onHeadsignsLoaded } from "@/lib/headsigns";
import { getStop, getRoute } from "@/lib/gtfs";
import { getStopReliability, aggregateStopReliability } from "@/lib/reliability.functions";
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
  const { t, locale } = useI18n();
  const [shareOpen, setShareOpen] = useState(false);
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

  // Wave 1.4 completion — per-stop reliability. Only fetches once we know
  // which routes actually serve this stop, and only when there's at least
  // one candidate. Returns per-route rows that we fold into a single
  // stop-wide score for the hero strip.
  const stopReliabilityFn = useServerFn(getStopReliability);
  const { data: stopReliabilityRows } = useQuery({
    queryKey: ["stopReliability", stopId, routeIdsHere.slice().sort().join(",")],
    queryFn: () =>
      stopReliabilityFn({ data: { stopId, routeIds: routeIdsHere } }),
    enabled: routeIdsHere.length > 0,
    staleTime: 5 * 60_000,
  });
  const stopReliability = useMemo(
    () => (stopReliabilityRows ? aggregateStopReliability(stopReliabilityRows) : null),
    [stopReliabilityRows],
  );

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
        <h1 className="font-display text-[40px] leading-[1.05] text-ink">

          {stop?.name ?? t("stop.unknown")}
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {stop
            ? `${stop.agency === "IC" ? t("stop.serviceIntercity") : t("stop.serviceUrban")} — ${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`
            : t("stop.notInDataset")}
        </p>
      </header>

      {stopReliability && stopReliability.sampleCount > 0 && (
        <section
          className="px-6 pb-5 animate-rise"
          style={{ animationDelay: "90ms" }}
          aria-label={t("reliability.stopEyebrow")}
        >
          <StopReliabilityStrip r={stopReliability} t={t} />
        </section>
      )}



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
    </AppShell>

  );
}

/**
 * Per-stop reliability card. Editorial, Mediterranean, mobile-first.
 * Renders a hero on-time percentage, a tier chip, a soft progress rail,
 * and split metric cells for sample size and mean deviation. Tone shifts
 * subtly by tier via a radial wash rather than a coloured block.
 */
function StopReliabilityStrip({
  r,
  t,
}: {
  r: {
    onTimePct: number;
    meanDelaySec: number;
    sampleCount: number;
    tier: "high" | "medium" | "low" | "unknown";
  };
  t: (k: never, vars?: Record<string, string | number>) => string;
}) {
  const rated = r.tier !== "unknown";
  const late = r.meanDelaySec > 0;
  const early = r.meanDelaySec < 0;

  const tone =
    r.tier === "high"
      ? {
          num: "text-olive",
          bar: "bg-olive",
          chipBg: "bg-olive-soft/45",
          chipInk: "text-olive",
          wash:
            "bg-[radial-gradient(120%_90%_at_10%_0%,color-mix(in_oklab,var(--color-olive-soft)_75%,transparent)_0%,transparent_60%)]",
          label: "Reliable",
        }
      : r.tier === "medium"
        ? {
            num: "text-ink",
            bar: "bg-ochre",
            chipBg: "bg-ochre-soft/60",
            chipInk: "text-ink",
            wash:
              "bg-[radial-gradient(120%_90%_at_10%_0%,color-mix(in_oklab,var(--color-ochre-soft)_70%,transparent)_0%,transparent_60%)]",
            label: "Steady",
          }
        : r.tier === "low"
          ? {
              num: "text-destructive",
              bar: "bg-destructive",
              chipBg: "bg-destructive/12",
              chipInk: "text-destructive",
              wash:
                "bg-[radial-gradient(120%_90%_at_10%_0%,color-mix(in_oklab,var(--color-destructive)_18%,transparent)_0%,transparent_60%)]",
              label: "Uneven",
            }
          : {
              num: "text-ink-soft",
              bar: "bg-ink-soft/30",
              chipBg: "bg-limestone-soft",
              chipInk: "text-ink-soft",
              wash: "",
              label: "Learning",
            };

  const deltaCopy = !rated
    ? t("reliability.subLearning" as never)
    : Math.abs(r.meanDelaySec) < 20
      ? t("reliability.subAvgOnTime" as never)
      : late
        ? t("reliability.subAvgLate" as never, { sec: r.meanDelaySec })
        : t("reliability.subAvgEarly" as never, { sec: Math.abs(r.meanDelaySec) });

  const delaySign = late ? "+" : early ? "−" : "±";
  const deltaMagnitude = Math.abs(r.meanDelaySec);

  // Ceiling the bar for tiny sample sizes so we don't over-promise a full rail.
  const barPct = rated ? Math.max(4, Math.min(100, r.onTimePct)) : 0;

  // Human-readable summary. No jargon, no numbers unless useful.
  const summary = !rated
    ? "Still learning this stop"
    : Math.abs(r.meanDelaySec) < 60
      ? "Usually runs on time"
      : late
        ? r.meanDelaySec < 180
          ? "Usually a minute or two late"
          : "Often runs late"
        : Math.abs(r.meanDelaySec) < 180
          ? "Sometimes leaves a touch early"
          : "Often leaves early";

  const hint = !rated
    ? "Not enough rider data yet"
    : r.tier === "high"
      ? "Safe to plan tight connections"
      : r.tier === "medium"
        ? "Give yourself a small buffer"
        : "Leave a few minutes of buffer";

  return (
    <article className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-line">
      <div className={`absolute inset-0 pointer-events-none ${tone.wash}`} aria-hidden />
      <div className="relative flex items-center gap-4 p-4 sm:p-5">
        <div
          className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full ${tone.chipBg}`}
          aria-hidden
        >
          <span className={`font-display text-[20px] leading-none tabular-nums -tracking-[0.02em] ${tone.num}`}>
            {rated ? r.onTimePct : "—"}
          </span>
          {rated && (
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-ink-soft mt-0.5">
              on time
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] sm:text-[16px] text-ink leading-snug">
            {summary}
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-soft leading-snug">{hint}</p>
        </div>
        <span
          className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.22em] px-2 py-1 rounded-full ${tone.chipBg} ${tone.chipInk}`}
        >
          {tone.label}
        </span>
      </div>
    </article>
  );
}

