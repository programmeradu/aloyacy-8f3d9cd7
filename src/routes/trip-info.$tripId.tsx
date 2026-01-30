import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowLeft, IconBus, IconPin } from "@/components/Icons";
import { useRealtime } from "@/lib/useRealtime";
import { getStop, getRoute, routeTone, distanceKm } from "@/lib/gtfs";
import { useI18n } from "@/lib/i18n";
import { en } from "@/lib/dictionaries/en";

const searchSchema = z.object({ from: z.string().optional() });

function fmtMeta(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export const Route = createFileRoute("/trip-info/$tripId")({
  validateSearch: searchSchema,
  head: ({ params }) => {
    const title = fmtMeta(en["tripInfo.meta.title"], { id: params.tripId });
    const desc = en["tripInfo.meta.desc"];
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `https://aloyacy.lovable.app/trip-info/${params.tripId}` },
        { property: "og:image", content: "https://aloyacy.lovable.app/og/og-tripinfo.jpg" },
        { property: "og:image:width", content: "1216" },
        { property: "og:image:height", content: "640" },
        { name: "twitter:image", content: "https://aloyacy.lovable.app/og/og-tripinfo.jpg" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: `https://aloyacy.lovable.app/trip-info/${params.tripId}` }],
    };
  },
  component: TripInfo,
});

function fmtClock(unix: number) {
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function TripInfo() {
  const { tripId } = Route.useParams();
  const { from: highlightStopId } = Route.useSearch();
  const { data: rt, isLoading } = useRealtime();
  const { t } = useI18n();

  const trip = useMemo(() => {
    if (!rt) return null;
    const arrivals = rt.arrivals
      .filter((a) => a.tripId === tripId)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix);
    if (arrivals.length === 0) return null;
    const routeId = arrivals[0].routeId;
    const route = getRoute(routeId);
    const vehicle = rt.vehicles.find((v) => v.tripId === tripId);

    const now = Math.floor(Date.now() / 1000);
    const nextIdx = arrivals.findIndex((a) => a.arrivalUnix >= now - 30);

    const stops = arrivals.map((a, i) => {
      const meta = getStop(a.stopId);
      const passed = nextIdx === -1 ? true : i < nextIdx;
      const next = i === nextIdx;
      return { ...a, meta, passed, next, index: i };
    });

    return { routeId, route, vehicle, stops, nextIdx };
  }, [rt, tripId]);

  const markers: MapMarker[] = useMemo(() => {
    if (!trip) return [];
    return trip.stops
      .filter((s) => s.meta)
      .map((s) => {
        const isHighlight = s.stopId === highlightStopId;
        return {
          lat: s.meta!.lat,
          lng: s.meta!.lng,
          label: s.meta!.name,
          kind: isHighlight ? "origin" : s.next ? "destination" : "stop",
          tone: isHighlight ? "ink" : s.next ? "ochre" : s.passed ? "olive" : "aegean",
        } as MapMarker;
      });
  }, [trip, highlightStopId]);

  const totalKm = useMemo(() => {
    if (!trip) return null;
    let km = 0;
    for (let i = 1; i < trip.stops.length; i++) {
      const a = trip.stops[i - 1].meta;
      const b = trip.stops[i].meta;
      if (a && b) km += distanceKm(a, b);
    }
    return km;
  }, [trip]);

  const backTo = highlightStopId
    ? { to: "/stop/$stopId" as const, params: { stopId: highlightStopId } }
    : { to: "/" as const, params: {} };

  return (
    <AppShell>
      <div className="px-6 pt-2 pb-4 flex items-center justify-between animate-rise">
        <Link
          {...backTo}
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("tripInfo.live")}
        </span>
        <span className="size-10" />
      </div>

      {!trip ? (
        <section className="px-6 mt-6 animate-rise">
          <h1 className="font-display text-[36px] leading-tight text-ink">
            {isLoading ? t("tripInfo.loading") : t("tripInfo.notLive.title")}
          </h1>
          <p className="mt-3 text-[13px] text-ink-soft">
            {t("tripInfo.notLive.body")}
          </p>
        </section>
      ) : (
        <>
          <header className="px-6 pb-5 animate-rise" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center gap-3">
              <RouteChip
                code={trip.route?.short ?? "?"}
                tone={routeTone(trip.routeId)}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {trip.vehicle?.label ? t("tripInfo.busLabel", { label: trip.vehicle.label }) : t("tripInfo.live")}
              </span>
            </div>
            <h1 className="mt-3 font-display text-[36px] leading-[1.05] text-ink text-balance">
              {trip.route?.long ?? t("tripInfo.unknownRoute")}
            </h1>
            <p className="mt-2 text-[13px] text-ink-soft">
              {t("tripInfo.stopsCount", { n: trip.stops.length })}
              {totalKm ? t("tripInfo.kmOfRoute", { km: totalKm.toFixed(1) }) : ""}
              {trip.stops[trip.stops.length - 1]?.meta
                ? t("tripInfo.endsAt", { name: trip.stops[trip.stops.length - 1].meta!.name })
                : ""}
            </p>
          </header>

          <section className="px-6 animate-rise" style={{ animationDelay: "120ms" }}>
            <MapPreview
              height="h-56"
              spanKm={6}
              markers={markers}
              restrictTripIds={[tripId]}
              liveLabel={{
                active: t("tripInfo.busActive"),
                empty: t("tripInfo.busEmpty"),
              }}
            />
          </section>

          <section className="mt-6 px-6 grid grid-cols-3 gap-2 animate-rise" style={{ animationDelay: "160ms" }}>
            <Insight
              label={t("tripInfo.nextStop")}
              value={
                trip.nextIdx === -1
                  ? "—"
                  : trip.stops[trip.nextIdx]?.meta?.name ?? "—"
              }
            />

            <Insight
              label={t("tripInfo.etaThere")}
              value={
                trip.nextIdx === -1
                  ? "—"
                  : fmtClock(trip.stops[trip.nextIdx].arrivalUnix)
              }
            />
            <Insight
              label={t("tripInfo.runningLabel")}
              value={(() => {
                if (trip.nextIdx === -1) return t("tripInfo.finished");
                const d = trip.stops[trip.nextIdx].delaySec;
                if (d > 60) return t("tripInfo.mLate", { m: Math.round(d / 60) });
                if (d < -60) return t("tripInfo.mEarly", { m: Math.round(-d / 60) });
                return t("tripInfo.onTime");
              })()}
            />
          </section>

          <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "200ms" }}>
            <div className="flex items-end justify-between mb-3">
              <h2 className="font-display text-2xl text-ink">{t("tripInfo.allStops")}</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {t("tripInfo.liveScheduled")}
              </span>
            </div>

            <ol className="relative rounded-[28px] bg-card ring-1 ring-line overflow-hidden">
              {trip.stops.map((s, i) => {
                const isHighlight = s.stopId === highlightStopId;
                const dotTone = s.passed
                  ? "bg-olive/40"
                  : s.next
                    ? "bg-ochre"
                    : "bg-aegean-deep/70";
                return (
                  <Link
                    key={s.stopId + i}
                    to="/stop/$stopId"
                    params={{ stopId: s.stopId }}
                    className={`relative flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 transition-colors hover:bg-limestone-soft/60 ${
                      isHighlight ? "bg-aegean-soft/30" : ""
                    }`}
                  >
                    <div className="relative flex flex-col items-center">
                      <span className={`size-2.5 rounded-full ${dotTone}`} />
                      {i < trip.stops.length - 1 && (
                        <span className="absolute top-3 h-12 w-px bg-line" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-display text-[17px] leading-tight text-pretty line-clamp-2 break-words ${
                        s.passed ? "text-ink-soft line-through decoration-1" : "text-ink"
                      }`}>
                        {s.meta?.name ?? t("tripInfo.stopFallback", { id: s.stopId })}
                      </p>

                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                        {s.next && <IconBus className="size-3 text-ochre" />}
                        {s.meta?.code ? t("tripInfo.stopCode", { code: s.meta.code }) : t("tripInfo.stopIndex", { n: s.index + 1 })}
                        {s.next && t("tripInfo.approaching")}
                        {isHighlight && t("tripInfo.youAreHere")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-display text-lg leading-none ${
                        s.next ? "text-ochre" : s.passed ? "text-ink-soft" : "text-ink"
                      }`}>
                        {fmtClock(s.arrivalUnix)}
                      </p>
                      {Math.abs(s.delaySec) > 60 && (
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft">
                          {s.delaySec > 0
                            ? `+${Math.round(s.delaySec / 60)}m`
                            : `${Math.round(s.delaySec / 60)}m`}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </ol>

            <p className="mt-4 flex items-start gap-2 text-[12px] text-ink-soft">
              <IconPin className="size-3.5 mt-0.5 shrink-0 text-ink-soft/70" />
              <span>{t("tripInfo.feedFoot")}</span>
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-line min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </p>
      <p className="mt-1 font-display text-[16px] leading-[1.15] text-ink text-pretty line-clamp-2 break-words">
        {value}
      </p>
    </div>
  );
}
