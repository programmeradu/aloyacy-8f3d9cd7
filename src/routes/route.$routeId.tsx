// Route detail page — /route/$routeId
//
// Board logic (trips on the line, canonical stop sequence, where each bus
// sits) lives in @aloya/core/route-board so the web and native screens agree.
// This file wires realtime data into the three sections below it.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { buildRouteBoard, type BoardStop } from "@aloya/core/route-board";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { ReliabilityBadge } from "@/components/ReliabilityBadge";
import { IntercityPatternsCard } from "@/components/IntercityPatternsCard";
import { IconArrowLeft } from "@/components/Icons";
import { RouteNextDepartureCard } from "@/components/route/RouteNextDepartureCard";
import { RouteRunsList } from "@/components/route/RouteRunsList";
import { RouteStopsList } from "@/components/route/RouteStopsList";
import { useRealtime } from "@/lib/useRealtime";
import { getRoute, getStop, routeTone } from "@/lib/gtfs";
import { getRouteReliability } from "@/lib/reliability.functions";
import { getIntercityInsights } from "@/lib/intercity-intel.functions";
import { routeHead } from "@/lib/route-page";
import routeVignette from "@/assets/route-vignette.jpg";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/route/$routeId")({
  head: ({ params }) => routeHead(params.routeId),
  component: RoutePage,
});

function RoutePage() {
  const { t } = useI18n();
  const { routeId } = Route.useParams();
  const { data: rt, isLoading } = useRealtime();
  const route = getRoute(routeId);
  const agency = route?.agency;
  const stopOf = (id: string): BoardStop | undefined => getStop(id, agency);

  const fetchReliability = useServerFn(getRouteReliability);
  const { data: reliability } = useQuery({
    queryKey: ["route-reliability", routeId],
    queryFn: () => fetchReliability({ data: { routeIds: [routeId] } }),
    staleTime: 5 * 60_000,
  });
  const rel = reliability?.[0];

  // Wave 3 — intercity intelligence (IC-only)
  const isIntercity = agency === "IC";
  const fetchIntercity = useServerFn(getIntercityInsights);
  const { data: intercity, isLoading: intercityLoading } = useQuery({
    queryKey: ["intercity-insights", routeId],
    queryFn: () => fetchIntercity({ data: { routeId } }),
    staleTime: 30 * 60_000,
    enabled: isIntercity,
  });

  const board = useMemo(() => {
    if (!rt) return null;
    return buildRouteBoard({
      routeId,
      arrivals: rt.arrivals,
      vehicles: rt.vehicles,
      stopOf,
    });
    // `stopOf` is a stable lookup over the static feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, routeId]);

  const markers: MapMarker[] = useMemo(() => {
    if (!board) return [];
    return board.stopIds
      .map((id) => stopOf(id))
      .filter((s): s is BoardStop => !!s)
      .map((s, i, arr) => ({
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        kind: i === 0 ? "origin" : i === arr.length - 1 ? "destination" : "stop",
        tone: "aegean",
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  const tone = routeTone(routeId);
  const tripIds = board?.trips.map((t) => t.tripId) ?? [];
  const firstTrip = board?.trips[0];
  const liveBus = firstTrip
    ? board?.busesOnLine.find((b) => b.tripId === firstTrip.tripId)
    : undefined;

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
            {t("route.lineSuffix", {
              agency: route?.agency === "IC" ? t("route.intercity") : t("route.nicosia"),
            })}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[36px] leading-[1.05] text-ink text-balance">
          {route?.long ?? t("route.fallbackName", { id: routeId })}
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {board?.vehicles.length
            ? board.vehicles.length === 1
              ? t("route.busesRunningOne")
              : t("route.busesRunningN", { n: board.vehicles.length })
            : t("route.noBusesReporting")}
          {board?.stopIds.length ? t("route.stopsOnLineSuffix", { n: board.stopIds.length }) : ""}
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
        {board?.vehicles.length || board?.stopIds.length ? (
          <MapPreview
            height="h-56"
            spanKm={board.vehicles.length ? 8 : 12}
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

      {board && firstTrip && (
        <RouteNextDepartureCard
          trip={firstTrip}
          liveBus={liveBus}
          atStop={liveBus ? stopOf(board.stopIds[liveBus.stopIndex]) : undefined}
          nextStop={stopOf(firstTrip.nextArrival.stopId)}
          terminus={stopOf(firstTrip.lastStop.stopId)}
        />
      )}

      {/* Wave 3 — Cross-island intercity intelligence (IC only) */}
      {isIntercity && (
        <section className="mt-6 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
          <IntercityPatternsCard insights={intercity} isLoading={intercityLoading} />
        </section>
      )}

      {board && board.trips.length > 1 ? <RouteRunsList board={board} stopOf={stopOf} /> : null}

      {board && board.stopIds.length ? (
        <RouteStopsList board={board} stopOf={stopOf} />
      ) : !isLoading ? (
        <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "240ms" }}>
          <div className="rounded-[28px] bg-card ring-1 ring-line p-6">
            <p className="font-display text-[20px] leading-tight text-ink">
              {t("route.stopsAppearTitle")}
            </p>
            <p className="mt-2 text-[13px] text-ink-soft">{t("route.stopsAppearBody")}</p>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
