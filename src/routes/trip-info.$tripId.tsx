import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowLeft, IconBus, IconPin } from "@/components/Icons";
import { useRealtime } from "@/lib/useRealtime";
import { getStop, getRoute, routeTone, distanceKm } from "@/lib/gtfs";

const searchSchema = z.object({ from: z.string().optional() });

export const Route = createFileRoute("/trip-info/$tripId")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Trip ${params.tripId} — Aloya` },
      { name: "description", content: "Live trip detail: stops, ETAs and where the bus is right now." },
    ],
  }),
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

  const trip = useMemo(() => {
    if (!rt) return null;
    const arrivals = rt.arrivals
      .filter((a) => a.tripId === tripId)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix);
    if (arrivals.length === 0) return null;
    const routeId = arrivals[0].routeId;
    const route = getRoute(routeId);
    const vehicle = rt.vehicles.find((v) => v.tripId === tripId);

    // Find which stop the bus is approaching: first arrival in future.
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
          Live trip
        </span>
        <span className="size-10" />
      </div>

      {!trip ? (
        <section className="px-6 mt-6 animate-rise">
          <h1 className="font-display text-[36px] leading-tight text-ink">
            {isLoading ? "Loading trip…" : "Trip not on the live feed"}
          </h1>
          <p className="mt-3 text-[13px] text-ink-soft">
            This vehicle isn't reporting right now. It may have finished its run,
            or the operator's feed dropped briefly. Try again in a moment.
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
                {trip.vehicle?.label ? `Bus ${trip.vehicle.label}` : "Live trip"}
              </span>
            </div>
            <h1 className="mt-3 font-display text-[36px] leading-[1.05] text-ink text-balance">
              {trip.route?.long ?? "Route"}
            </h1>
            <p className="mt-2 text-[13px] text-ink-soft">
              {trip.stops.length} stops
              {totalKm ? ` — ${totalKm.toFixed(1)} km of route` : ""}
              {trip.stops[trip.stops.length - 1]?.meta
                ? ` — ends at ${trip.stops[trip.stops.length - 1].meta!.name}`
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
                active: "Bus on this trip — live",
                empty: "Bus position not reporting",
              }}
            />
          </section>

          {/* Smart insights */}
          <section className="mt-6 px-6 grid grid-cols-3 gap-2 animate-rise" style={{ animationDelay: "160ms" }}>
            <Insight
              label="Next stop"
              value={
                trip.nextIdx === -1
                  ? "—"
                  : trip.stops[trip.nextIdx]?.meta?.name.split(/[·\-,]/)[0].trim() ?? "—"
              }
            />
            <Insight
              label="Eta there"
              value={
                trip.nextIdx === -1
                  ? "—"
                  : fmtClock(trip.stops[trip.nextIdx].arrivalUnix)
              }
            />
            <Insight
              label="Running"
              value={(() => {
                if (trip.nextIdx === -1) return "Finished";
                const d = trip.stops[trip.nextIdx].delaySec;
                if (d > 60) return `${Math.round(d / 60)}m late`;
                if (d < -60) return `${Math.round(-d / 60)}m early`;
                return "On time";
              })()}
            />
          </section>

          {/* Stop sequence */}
          <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "200ms" }}>
            <div className="flex items-end justify-between mb-3">
              <h2 className="font-display text-2xl text-ink">All stops</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                Live, scheduled clock
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
                      <p className={`font-display text-[17px] leading-tight truncate ${
                        s.passed ? "text-ink-soft line-through decoration-1" : "text-ink"
                      }`}>
                        {s.meta?.name ?? `Stop ${s.stopId}`}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                        {s.next && <IconBus className="size-3 text-ochre" />}
                        {s.meta?.code ? `Stop ${s.meta.code}` : `#${s.index + 1}`}
                        {s.next && " — approaching"}
                        {isHighlight && " — you are here"}
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
              <span>
                Stop times are pulled live from the operator's feed and adjusted for the
                bus's reported delay. Tap any stop to open its live departures.
              </span>
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

