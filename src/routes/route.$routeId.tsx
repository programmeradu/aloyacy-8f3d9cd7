import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { ReliabilityBadge } from "@/components/ReliabilityBadge";
import { IntercityPatternsCard } from "@/components/IntercityPatternsCard";
import { IconArrowLeft, IconBus } from "@/components/Icons";
import { useRealtime } from "@/lib/useRealtime";
import { getRoute, getStop, routeTone } from "@/lib/gtfs";
import { distanceM } from "@/lib/geo";
import { getRouteReliability } from "@/lib/reliability.functions";
import { getIntercityInsights } from "@/lib/intercity-intel.functions";
import routeVignette from "@/assets/route-vignette.jpg";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/route/$routeId")({
  head: ({ params }) => {
    const title = `Route ${params.routeId} — Aloya`;
    const desc = `Live buses, next departure and every stop on Cyprus bus route ${params.routeId}.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `https://app.aloya.cy/route/${params.routeId}` },
        { property: "og:image", content: "https://app.aloya.cy/og/og-route.jpg" },
        { property: "og:image:width", content: "1216" },
        { property: "og:image:height", content: "640" },
        { name: "twitter:image", content: "https://app.aloya.cy/og/og-route.jpg" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: `https://app.aloya.cy/route/${params.routeId}` }],
    };
  },
  component: RoutePage,
});

function fmtClock(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}


function useMinutesFromNow() {
  const { t } = useI18n();
  return (unix: number) => {
    const m = Math.round((unix - Date.now() / 1000) / 60);
    if (m <= 0) return t("route.due");
    if (m < 60) return t("route.minShort", { m });
    const h = Math.floor(m / 60);
    return t("route.hourMin", { h, m: m % 60 });
  };
}

function RoutePage() {
  const { t } = useI18n();
  const minutesFromNow = useMinutesFromNow();
  const { routeId } = Route.useParams();
  const { data: rt, isLoading } = useRealtime();
  const route = getRoute(routeId);
  const agency = route?.agency;
  const stopOf = (id: string) => getStop(id, agency);

  const fetchReliability = useServerFn(getRouteReliability);
  const { data: reliability } = useQuery({
    queryKey: ["route-reliability", routeId],
    queryFn: () => fetchReliability({ data: { routeIds: [routeId] } }),
    staleTime: 5 * 60_000,
  });
  const rel = reliability?.[0];

  const data = useMemo(() => {
    if (!rt) return null;

    // Group arrivals by trip
    const tripMap = new Map<string, typeof rt.arrivals>();
    for (const a of rt.arrivals) {
      if (a.routeId !== routeId) continue;
      const arr = tripMap.get(a.tripId) ?? [];
      arr.push(a);
      tripMap.set(a.tripId, arr);
    }

    const now = Math.floor(Date.now() / 1000);
    const trips = Array.from(tripMap.entries())
      .map(([tripId, arrs]) => {
        const sorted = [...arrs].sort((x, y) => x.arrivalUnix - y.arrivalUnix);
        const upcoming = sorted.find((s) => s.arrivalUnix >= now - 30) ?? sorted[sorted.length - 1];
        return {
          tripId,
          arrivals: sorted,
          firstStop: sorted[0],
          lastStop: sorted[sorted.length - 1],
          nextArrival: upcoming,
        };
      })
      .sort((a, b) => a.nextArrival.arrivalUnix - b.nextArrival.arrivalUnix);

    const vehicles = rt.vehicles.filter((v) => v.routeId === routeId);

    // Unique ordered stop list: take the longest trip as canonical sequence.
    const longest = trips.reduce(
      (best, t) => (t.arrivals.length > (best?.arrivals.length ?? 0) ? t : best),
      trips[0],
    );
    const stopIds = longest
      ? Array.from(new Set(longest.arrivals.map((a) => a.stopId)))
      : [];

    // For each live vehicle, determine which stop in the canonical sequence
    // it is at (<120m) or approaching (next scheduled stop on its trip).
    const now2 = Math.floor(Date.now() / 1000);
    type BusOnLine = {
      vehicleId: string;
      tripId: string;
      stopIndex: number;
      status: "at" | "approaching" | "departing";
      speed: number;
    };
    const busesOnLine: BusOnLine[] = [];
    for (const v of vehicles) {
      // Find nearest stop in the canonical sequence
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < stopIds.length; i++) {
        const stop = stopOf(stopIds[i]);
        if (!stop) continue;
        const d = distanceM({ lat: v.lat, lng: v.lng }, stop);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      if (nearestIdx === -1) continue;

      // If close enough → at that stop. Otherwise approaching the next
      // stop the bus is scheduled to reach on its own trip.
      if (nearestDist < 120) {
        const isOrigin = nearestIdx === 0;
        busesOnLine.push({
          vehicleId: v.id,
          tripId: v.tripId,
          stopIndex: nearestIdx,
          status: isOrigin && v.speed < 1 ? "departing" : "at",
          speed: v.speed,
        });
      } else {
        const tripArrivals = tripMap.get(v.tripId) ?? [];
        const nextScheduled = [...tripArrivals]
          .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
          .find((a) => a.arrivalUnix >= now2 - 30);
        const targetStopId = nextScheduled?.stopId;
        const targetIdx = targetStopId
          ? stopIds.indexOf(targetStopId)
          : nearestIdx;
        busesOnLine.push({
          vehicleId: v.id,
          tripId: v.tripId,
          stopIndex: targetIdx >= 0 ? targetIdx : nearestIdx,
          status: "approaching",
          speed: v.speed,
        });
      }
    }

    return { trips, vehicles, stopIds, longest, busesOnLine };
  }, [rt, routeId]);

  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    return data.stopIds
      .map((id) => stopOf(id))
      .filter((s): s is NonNullable<ReturnType<typeof getStop>> => !!s)
      .map((s, i, arr) => ({
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        kind: i === 0 ? "origin" : i === arr.length - 1 ? "destination" : "stop",
        tone: "aegean",
      }));
  }, [data]);

  const tone = routeTone(routeId);
  const tripIds = data?.trips.map((t) => t.tripId) ?? [];

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
          {t("route.overview")}
        </span>
        <span className="size-10" />
      </div>

      <header className="px-6 pb-5 animate-rise" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-3">
          <RouteChip code={route?.short ?? routeId} tone={tone} />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {t("route.lineSuffix", { agency: route?.agency === "IC" ? t("route.intercity") : t("route.nicosia") })}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[36px] leading-[1.05] text-ink text-balance">
          {route?.long ?? t("route.fallbackName", { id: routeId })}
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {data?.vehicles.length
            ? data.vehicles.length === 1
              ? t("route.busesRunningOne")
              : t("route.busesRunningN", { n: data.vehicles.length })
            : t("route.noBusesReporting")}
          {data?.stopIds.length ? t("route.stopsOnLineSuffix", { n: data.stopIds.length }) : ""}
        </p>
        {rel && (
          <div className="mt-4">
            <ReliabilityBadge
              tier={rel.tier}
              onTimePct={rel.onTimePct}
              meanDelaySec={rel.meanDelaySec}
              sampleCount={rel.sampleCount}
              variant="stack"
            />
          </div>
        )}
      </header>

      {/* Editorial vignette + map stacked */}
      <section className="px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        {data?.vehicles.length || data?.stopIds.length ? (
          <MapPreview
            height="h-56"
            spanKm={data.vehicles.length ? 8 : 12}
            markers={markers}
            restrictTripIds={tripIds.length ? tripIds : undefined}
            liveLabel={{
              active: t("route.liveOnLine"),
              empty: t("route.noLiveOnLine"),
            }}
          />
        ) : (
          <div className="relative h-56 rounded-[28px] overflow-hidden ring-1 ring-line">
            <img
              src={routeVignette}
              alt=""
              width={1536}
              height={768}
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-limestone/80 via-limestone/10 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft">
                {t("route.serviceWindow")}
              </p>
              <p className="mt-1 font-display text-[20px] leading-tight text-ink">
                {isLoading ? t("route.checking") : t("route.quiet")}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Next departure / Live status card */}
      {data?.trips.length ? (() => {
        const firstTrip = data.trips[0];
        const liveBus = data.busesOnLine.find((b) => b.tripId === firstTrip.tripId);
        const nextStopName =
          stopOf(firstTrip.nextArrival.stopId)?.name ?? t("route.upcomingStop");
        const terminusName = stopOf(firstTrip.lastStop.stopId)?.name ?? t("route.terminus");

        let kicker = t("route.nextDeparture");
        let kickerTone = "text-limestone/60";
        let bigText = nextStopName;
        let footer = t("route.endsAt", {
          time: fmtClock(firstTrip.nextArrival.arrivalUnix),
          terminus: terminusName,
        });
        let pillText = minutesFromNow(firstTrip.nextArrival.arrivalUnix);

        if (liveBus) {
          const atStop = stopOf(data.stopIds[liveBus.stopIndex]);
          if (liveBus.status === "departing") {
            kicker = t("route.aboutToDepart");
            kickerTone = "text-ochre";
            bigText = atStop?.name ?? nextStopName;
            footer = t("route.boardingOrigin", { terminus: terminusName });
            pillText = t("route.boardingPill");
          } else if (liveBus.status === "at") {
            kicker = t("route.busAtStop");
            kickerTone = "text-ochre";
            bigText = atStop?.name ?? nextStopName;
            footer = t("route.doorsOpen", { name: nextStopName });
            pillText = t("route.atStopPill");
          } else {
            const kmh = Math.round(liveBus.speed * 3.6);
            kicker = kmh > 3 ? t("route.busInMotion") : t("route.busEnRoute");
            kickerTone = "text-ochre";
            bigText = t("route.headingTo", { name: nextStopName });
            footer =
              (kmh > 3 ? t("route.kmhPrefix", { kmh }) : "") +
              t("route.arrivingEnds", {
                time: fmtClock(firstTrip.nextArrival.arrivalUnix),
                terminus: terminusName,
              });
            pillText = minutesFromNow(firstTrip.nextArrival.arrivalUnix);
          }
        }

        return (
          <section className="mt-6 px-6 animate-rise" style={{ animationDelay: "160ms" }}>
            <Link
              to="/trip-info/$tripId"
              params={{ tripId: firstTrip.tripId }}
              className="block rounded-[28px] bg-ink text-limestone p-5 ring-1 ring-ink/10 transition-transform active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <p className={`font-mono text-[10px] uppercase tracking-[0.22em] ${kickerTone}`}>
                  {liveBus ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="relative inline-flex">
                        <span className="size-1.5 rounded-full bg-ochre" />
                        <span className="absolute inset-0 size-1.5 rounded-full bg-ochre animate-ping opacity-70" />
                      </span>
                      {kicker}
                    </span>
                  ) : (
                    kicker
                  )}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
                  {pillText}
                </p>
              </div>
              <p className="mt-3 font-display text-[28px] leading-[1.05] text-limestone text-balance">
                {bigText}
              </p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-limestone/70">
                {footer}
              </p>
            </Link>
          </section>
        );
      })() : null}

      {/* Upcoming runs */}
      {data && data.trips.length > 1 ? (
        <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "200ms" }}>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-2xl text-ink">{t("route.todaysRuns")}</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {t("route.fromLive")}
            </span>
          </div>
          <ol className="rounded-[28px] bg-card ring-1 ring-line overflow-hidden">
            {data.trips.slice(1, 6).map((trip) => {
              const live = data.vehicles.some((v) => v.tripId === trip.tripId);
              return (
                <Link
                  key={trip.tripId}
                  to="/trip-info/$tripId"
                  params={{ tripId: trip.tripId }}
                  className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 transition-colors hover:bg-limestone-soft/60"
                >
                  <div className="font-display text-2xl text-ink tabular-nums w-16">
                    {fmtClock(trip.nextArrival.arrivalUnix)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] leading-tight text-ink truncate">
                      {stopOf(trip.nextArrival.stopId)?.name ?? t("route.nextStop")}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                      {live && <IconBus className="size-3 text-ochre" />}
                      {live ? t("route.liveNow") : t("route.scheduled")}
                      {" — "}
                      {t("route.toName", { name: stopOf(trip.lastStop.stopId)?.name.split(/[·\-,]/)[0].trim() ?? t("route.terminus") })}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {minutesFromNow(trip.nextArrival.arrivalUnix)}
                  </span>
                </Link>
              );
            })}
          </ol>
        </section>
      ) : null}

      {/* Stops on the line */}
      {data && data.stopIds.length ? (
        <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "240ms" }}>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-2xl text-ink">{t("route.stopsOnThis")}</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {t("route.stopsCount", { n: data.stopIds.length })}
            </span>
          </div>
          <ol className="rounded-[28px] bg-card ring-1 ring-line overflow-hidden">
            {data.stopIds.map((id, i) => {
              const s = stopOf(id);
              if (!s) return null;
              const isEdge = i === 0 || i === data.stopIds.length - 1;
              const busHere = data.busesOnLine.find(
                (b) => b.stopIndex === i && (b.status === "at" || b.status === "departing"),
              );
              const busApproaching = data.busesOnLine.find(
                (b) => b.stopIndex === i && b.status === "approaching",
              );
              const liveLabel = busHere
                ? busHere.status === "departing"
                  ? t("route.busDepartingNow")
                  : t("route.busAtThisStop")
                : busApproaching
                  ? t("route.busApproaching")
                  : null;
              return (
                <Link
                  key={id}
                  to="/stop/$stopId"
                  params={{ stopId: id }}
                  className={`relative flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 transition-colors hover:bg-limestone-soft/60 ${
                    liveLabel ? "bg-ochre/5" : ""
                  }`}
                >
                  <div className="relative flex flex-col items-center">
                    {busHere ? (
                      <span className="relative flex size-4 items-center justify-center">
                        <span className="absolute inset-0 rounded-full bg-ochre/30 animate-ping" />
                        <span className="relative flex size-4 items-center justify-center rounded-full bg-ochre ring-2 ring-limestone">
                          <IconBus className="size-2.5 text-ink" />
                        </span>
                      </span>
                    ) : busApproaching ? (
                      <span className="relative flex size-3 items-center justify-center">
                        <span className="absolute inset-0 rounded-full bg-ochre/40 animate-ping" />
                        <span className="relative size-2.5 rounded-full bg-ochre ring-2 ring-limestone" />
                      </span>
                    ) : (
                      <span
                        className={`size-2.5 rounded-full ${
                          isEdge ? "bg-ochre" : "bg-aegean-deep/70"
                        }`}
                      />
                    )}
                    {i < data.stopIds.length - 1 && (
                      <span className="absolute top-4 h-12 w-px bg-line" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] leading-tight text-ink truncate">
                      {s.name}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] truncate ${
                        liveLabel ? "text-ochre" : "text-ink-soft"
                      }`}
                    >
                      {liveLabel ?? (
                        <>
                          {i === 0
                            ? t("route.origin")
                            : i === data.stopIds.length - 1
                              ? t("route.terminus")
                              : t("route.stopN", { n: i + 1 })}
                          {s.code ? ` — #${s.code}` : ""}
                        </>
                      )}
                    </p>
                  </div>
                </Link>
              );
            })}
          </ol>
        </section>
      ) : !isLoading ? (
        <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "240ms" }}>
          <div className="rounded-[28px] bg-card ring-1 ring-line p-6">
            <p className="font-display text-[20px] leading-tight text-ink">
              {t("route.stopsAppearTitle")}
            </p>
            <p className="mt-2 text-[13px] text-ink-soft">
              {t("route.stopsAppearBody")}
            </p>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
