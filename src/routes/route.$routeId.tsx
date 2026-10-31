// Route detail page: /route/$routeId (Roam, concept 07)
//
// Board logic (trips on the line, canonical stop sequence, where each bus
// sits) lives in @aloya/core/route-board so the web and native screens agree.
// This file wires realtime data into the three sections below it.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { buildRouteBoard, type BoardStop } from "@aloya/core/route-board";
import { resolveAgency } from "@aloya/core/home-search";
import { useRoamI18n, type RoamKey } from "@/lib/roam-i18n";
import { openMeSheet } from "@/components/roam/me-store";
import { Icon } from "@/components/roam/Icon";

const AREA_KEY: Record<string, RoamKey> = {
  NPT: "lines.nicosia",
  LMS: "lines.limassol",
  LCA: "lines.larnaca",
  PFO: "lines.paphos",
  FAM: "lines.famagusta",
  IC: "lines.intercity",
};

/** "Famagusta buses", "Intercity"... from the route's own agency or feed. */
function areaLabel(agency: string, r: (k: RoamKey) => string): string {
  if (agency === "SPC") return "Pame Express";
  const key = AREA_KEY[agency];
  return key ? r(key) : "";
}
import { OfflineBanner } from "@/components/OfflineBanner";
import { NotchCard } from "@/components/roam/NotchCard";
import { FrostButton } from "@/components/roam/FrostButton";
import { RouteHero } from "@/components/route/RouteHero";
import { RouteTimeline } from "@/components/route/RouteTimeline";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { ReliabilityBadge } from "@/components/ReliabilityBadge";
import { IntercityPatternsCard } from "@/components/IntercityPatternsCard";
import { RouteNextDepartureCard } from "@/components/route/RouteNextDepartureCard";
import { RouteRunsList } from "@/components/route/RouteRunsList";
import { useRealtime } from "@/lib/useRealtime";
import { getRoute, getStop, STOPS } from "@/lib/gtfs";
import { splitLongName } from "@/lib/place-names";
import { getEncodedShapeSync, whenShapesLoaded } from "@/lib/shapes";
import polylineCodec from "@mapbox/polyline";
import { getRouteReliability } from "@/lib/reliability.functions";
import { getIntercityInsights } from "@/lib/intercity-intel.functions";
import { routeHead } from "@/lib/route-page";
import { loadRouteSampleCount } from "@/lib/route-index.server";
import { useI18n } from "@/lib/i18n";
import { RoamShareSheet, currentOrigin, shareCardUrl } from "@/components/RoamShareSheet";
import {
  useStarredRoutes,
  toggleStarredRoute,
  setRouteNotifyDisruptions,
} from "@/lib/route-favorites";
import { NotificationPromptSheet } from "@/components/NotificationPromptSheet";
import routeStopsData from "@/data/route_stops.json";
import { buildOfflineBoardArrivals } from "@/lib/offline-timetable-db";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

const STOP_NAMES = Array.from(new Set(STOPS.map((s) => s.name)));

export const Route = createFileRoute("/route/$routeId")({
  loader: ({ params }) => loadRouteSampleCount(params.routeId),
  head: ({ params, loaderData }) => routeHead(params.routeId, loaderData),
  component: RoutePage,
});

function RoutePage() {
  const { t } = useI18n();
  const { r } = useRoamI18n();
  const { routeId } = Route.useParams();
  const { data: rt, isLoading } = useRealtime();
  const route = getRoute(routeId);
  const agency = route?.agency;
  const stopOf = (id: string): BoardStop | undefined => getStop(id, agency);

  const starredRoutes = useStarredRoutes();
  const isStarred = !!starredRoutes[routeId];
  const notifyDisruptions = isStarred && starredRoutes[routeId]?.notifyDisruptions;
  const [promptOpen, setPromptOpen] = useState(false);

  function handleToggleStar() {
    const nextStarred = toggleStarredRoute(routeId, {
      routeShort: route?.short ?? routeId,
      agency: route?.agency,
      notifyDisruptions: true,
    });
    if (
      nextStarred &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      setPromptOpen(true);
    }
  }

  const fetchReliability = useServerFn(getRouteReliability);
  const { data: reliability } = useQuery({
    queryKey: ["route-reliability", routeId],
    queryFn: () => fetchReliability({ data: { routeIds: [routeId] } }),
    staleTime: 5 * 60_000,
  });
  const rel = reliability?.[0];

  // Wave 3: intercity intelligence (IC-only)
  const isIntercity = agency === "IC";
  const fetchIntercity = useServerFn(getIntercityInsights);
  const { data: intercity, isLoading: intercityLoading } = useQuery({
    queryKey: ["intercity-insights", routeId],
    queryFn: () => fetchIntercity({ data: { routeId } }),
    staleTime: 30 * 60_000,
    enabled: isIntercity,
  });

  const isOnline = useOnlineStatus();
  const [offlineArrivals, setOfflineArrivals] = useState<any[] | null>(null);

  useEffect(() => {
    if (!isOnline && typeof window !== "undefined") {
      buildOfflineBoardArrivals(routeId).then((arrs) => {
        if (arrs && arrs.length > 0) setOfflineArrivals(arrs);
      });
    }
  }, [isOnline, routeId]);

  const fallbackStopIds = useMemo(() => {
    const map = routeStopsData as Record<string, string[]>;
    return map[routeId] || [];
  }, [routeId]);

  const board = useMemo(() => {
    const arrivals = rt?.arrivals?.length ? rt.arrivals : (offlineArrivals ?? []);
    const vehicles = rt?.vehicles ?? [];
    if (!arrivals.length && !fallbackStopIds.length) return null;

    const b = buildRouteBoard({
      routeId,
      arrivals,
      vehicles,
      stopOf,
    });

    if (b.stopIds.length === 0 && fallbackStopIds.length > 0) {
      return {
        ...b,
        stopIds: fallbackStopIds,
      };
    }
    return b;
    // `stopOf` is a stable lookup over the static feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, offlineArrivals, fallbackStopIds, routeId]);

  const tripIds = board?.trips.map((t) => t.tripId) ?? [];
  const firstTrip = board?.trips[0];
  const liveBus = firstTrip
    ? board?.busesOnLine.find((b) => b.tripId === firstTrip.tripId)
    : undefined;

  // Next stop of the live bus is highlighted on the map.
  const nextIdx = liveBus ? Math.min(liveBus.stopIndex + 1, (board?.stopIds.length ?? 1) - 1) : -1;
  const markers: MapMarker[] = useMemo(() => {
    if (!board) return [];
    return board.stopIds
      .map((id) => stopOf(id))
      .filter((s): s is BoardStop => !!s)
      .map((s, i, arr) => ({
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        kind:
          i === 0
            ? "origin"
            : i === arr.length - 1
              ? "destination"
              : i === nextIdx
                ? "next"
                : "stop",
        tone: "aegean",
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, nextIdx]);

  // Route path: the GTFS shape for this line once the shape index loads; until
  // then (or when the feed has no shape) a line through the stops in order.
  const [shapesReady, setShapesReady] = useState(false);
  useEffect(() => {
    let live = true;
    void whenShapesLoaded().then(() => live && setShapesReady(true));
    return () => {
      live = false;
    };
  }, []);
  const routePolyline = useMemo(() => {
    const shape = shapesReady ? getEncodedShapeSync(routeId, firstTrip?.tripId) : null;
    if (shape) return shape;
    if (markers.length < 2) return undefined;
    return polylineCodec.encode(markers.map((m) => [m.lat, m.lng] as [number, number]));
  }, [shapesReady, routeId, firstTrip?.tripId, markers]);

  const lineShort = route?.short ?? routeId;
  const { origin, dest } = splitLongName(route?.long, {
    routeStopNames: (board?.stopIds ?? fallbackStopIds)
      .map((id) => stopOf(id)?.name)
      .filter((n): n is string => !!n),
    allNames: STOP_NAMES,
    firstStop: stopOf(board?.stopIds[0] ?? "")?.name,
  });
  const area = areaLabel(resolveAgency({ agency: route?.agency, id: routeId }), r);
  const liveCount = board?.vehicles.length ?? 0;
  const { t: tShare, locale: shareLocale } = useI18n();
  const [shareOpen, setShareOpen] = useState(false);
  const onShare = () => setShareOpen(true);

  return (
    <div className="roam r-page">
      <RoamShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={tShare("share.line.title")}
        imageUrl={
          shareOpen ? shareCardUrl(`/api/public/og/line/${encodeURIComponent(routeId)}`) : null
        }
        shareUrl={`${currentOrigin()}/route/${routeId}`}
        shareText={
          shareLocale === "el"
            ? `Λεωφορείο ${lineShort}${dest ? ` προς ${dest}` : ""}\nΖωντανά λεωφορεία στο Aloya`
            : `Bus ${lineShort}${dest ? ` to ${dest}` : ""}\nLive buses on Aloya`
        }
        fileName={`aloya-line-${lineShort}`}
      />
      <div className="r-col">
        <OfflineBanner />
        <RouteHero
          markers={markers}
          polyline={routePolyline}
          tripIds={tripIds}
          spanKm={board?.vehicles.length ? 8 : 12}
          starred={isStarred}
          onStar={handleToggleStar}
          onShare={onShare}
        />
        <NotchCard
          className="r-hero-sheet"
          radius={34}
          shadow="drop-shadow(0 -8px 24px rgba(0,0,0,.16))"
          notches={[
            {
              edge: "top",
              cx: 0,
              center: true,
              width: 100,
              depth: 26,
              dock: (
                <FrostButton
                  icon="bell-simple"
                  variant="white"
                  large
                  label={r("line.alerts")}
                  onClick={() => openMeSheet("alerts")}
                />
              ),
            },
          ]}
        >
          <div
            className="px-5 pt-8"
            style={{
              paddingBottom: "calc(var(--r-safe-bottom) + 120px)",
              minHeight: "calc(100dvh - 304px)",
            }}
          >
            <span className="r-pill r-pill--y r-tnum">
              <Icon name="bus" /> {lineShort}
            </span>
            <h1 className="r-t1 mt-3" style={{ textWrap: "balance" }}>
              {dest || t("route.fallbackName", { id: routeId })}
            </h1>
            <p className="r-lbl mt-1.5">
              {[
                origin ? r("line.from", { place: origin }) : "",
                board?.stopIds.length ? r("line.nStops", { n: board.stopIds.length }) : "",
                area,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="r-hscroll mt-4">
              <span className="r-pill r-pill--lg r-pill--o">
                <span className={`r-dot${liveCount ? "" : " r-dot--grey"}`} />
                {liveCount ? r("line.live", { n: liveCount }) : r("line.noLive")}
              </span>
              {!isOnline && <span className="r-pill r-pill--lg r-pill--o">Offline</span>}
            </div>

            {rel && (
              <div className="r-legacy mt-4">
                <ReliabilityBadge
                  tier={rel.tier}
                  onTimePct={rel.onTimePct}
                  meanDelaySec={rel.meanDelaySec}
                  sampleCount={rel.sampleCount}
                  variant="stack"
                />
              </div>
            )}

            {isStarred && (
              <div className="r-card r-card--soft mt-4 flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium leading-tight">{r("line.disruptions")}</p>
                  <p className="r-lbl mt-0.5">{r("line.disruptionsSub", { line: lineShort })}</p>
                </div>
                <button
                  type="button"
                  aria-pressed={!!notifyDisruptions}
                  onClick={() => {
                    const next = !notifyDisruptions;
                    setRouteNotifyDisruptions(routeId, next);
                    if (
                      next &&
                      typeof window !== "undefined" &&
                      "Notification" in window &&
                      Notification.permission === "default"
                    ) {
                      setPromptOpen(true);
                    }
                  }}
                  className={`r-pill r-pill--lg ${notifyDisruptions ? "r-pill--k" : "r-pill--o"}`}
                >
                  {notifyDisruptions ? r("line.on") : r("line.off")}
                </button>
              </div>
            )}

            {board && board.stopIds.length ? (
              <div className="mt-5">
                <RouteTimeline
                  stopIds={board.stopIds}
                  stopOf={stopOf}
                  trip={firstTrip}
                  bus={liveBus}
                  lineShort={lineShort}
                />
              </div>
            ) : !isLoading ? (
              <div className="r-card r-card--soft mt-5 p-5">
                <p className="text-[18px] font-medium leading-tight">
                  {t("route.stopsAppearTitle")}
                </p>
                <p className="r-lbl mt-2">{t("route.stopsAppearBody")}</p>
              </div>
            ) : null}

            <div className="r-legacy -mx-6 mt-4">
              {board && firstTrip && (
                <RouteNextDepartureCard
                  trip={firstTrip}
                  liveBus={liveBus}
                  atStop={liveBus ? stopOf(board.stopIds[liveBus.stopIndex]) : undefined}
                  nextStop={stopOf(firstTrip.nextArrival.stopId)}
                  terminus={stopOf(firstTrip.lastStop.stopId)}
                />
              )}
              {isIntercity && (
                <section className="mt-6 px-6">
                  <IntercityPatternsCard insights={intercity} isLoading={intercityLoading} />
                </section>
              )}
              {board && board.trips.length > 1 ? (
                <RouteRunsList board={board} stopOf={stopOf} />
              ) : null}
            </div>
          </div>
        </NotchCard>
      </div>

      <NotificationPromptSheet
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        reason="disruption"
      />
    </div>
  );
}
