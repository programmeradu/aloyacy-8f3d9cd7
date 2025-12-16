// Live re-plan sheet. Opens from the DisruptionBanner CTA mid-trip when
// the rider is running late, missed a connection, or wants a different
// route from where they currently are. Mirrors EarlyAlightSheet's pattern
// (reroute → swap ActiveTrip) but with disruption-aware copy.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { rerouteFromHere } from "@/lib/reroute.functions";
import { logTripOverride } from "@/lib/overrides.functions";
import {
  setActiveTrip,
  initialLegState,
  type ActiveTrip,
} from "@/lib/trip-store";
import { getDeviceId } from "@/lib/pwa";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import type { JourneyOption } from "@/lib/journey.server";
import type { DisruptionKind } from "@/lib/useDisruptionWatch";

function fmtMin(s: number) {
  return `${Math.max(0, Math.round(s / 60))} min`;
}

// Same shape EarlyAlightSheet uses — kept local to avoid coupling.
function synthesizeOption(it: Itinerary): JourneyOption {
  const firstRide = it.legs.find((l): l is RideLeg => l.kind === "ride");
  const walkIn = it.legs[0];
  const walkOut = it.legs[it.legs.length - 1];
  const legs: JourneyOption["legs"] = [];
  if (walkIn?.kind === "walk") {
    const w = walkIn as WalkLeg;
    legs.push({
      kind: "walk",
      from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
      to: { lat: w.to.lat, lng: w.to.lng, label: w.to.name },
      durationSec: w.durationSec,
      distanceMeters: w.distanceMeters,
    });
  }
  if (firstRide) {
    legs.push({
      kind: "bus",
      routeId: firstRide.routeId,
      routeShort: firstRide.routeShort,
      routeLong: firstRide.routeLong,
      tripId: firstRide.tripId,
      board: {
        stopId: firstRide.board.stopId,
        name: firstRide.board.name,
        departureUnix: firstRide.board.departureUnix,
      },
      alight: {
        stopId: firstRide.alight.stopId,
        name: firstRide.alight.name,
        arrivalUnix: firstRide.alight.arrivalUnix,
      },
      delaySec: firstRide.delaySec,
    });
  }
  if (walkOut && walkOut !== walkIn && walkOut.kind === "walk") {
    const w = walkOut as WalkLeg;
    legs.push({
      kind: "walk",
      from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
      to: { lat: w.to.lat, lng: w.to.lng, label: w.to.name },
      durationSec: w.durationSec,
      distanceMeters: w.distanceMeters,
    });
  }
  return {
    id: it.id,
    totalDurationSec: it.totalDurationSec,
    departureUnix: it.departureUnix,
    arrivalUnix: it.arrivalUnix,
    legs,
    transfers: it.transfers,
  };
}

const COPY: Record<DisruptionKind, { eyebrow: string; title: string; sub: string }> = {
  "missed-connection": {
    eyebrow: "Connection missed",
    title: "Let's find another way.",
    sub: "Fresh options from where you are right now.",
  },
  "running-late": {
    eyebrow: "Running late",
    title: "Want a faster route from here?",
    sub: "We'll re-plan around the current delay.",
  },
  "connection-at-risk": {
    eyebrow: "Plan B ready",
    title: "If you miss it, here's what's next.",
    sub: "Tap any option to switch — or keep going if you make the bus.",
  },
  "vehicle-lost-feed": {
    eyebrow: "Switch route",
    title: "Re-plan from where you are.",
    sub: "Fresh options computed from your current position.",
  },
};

export function LiveReplanSheet({
  active,
  fix,
  kind,
  onClose,
}: {
  active: ActiveTrip;
  fix: { lat: number; lng: number };
  kind: DisruptionKind;
  onClose: () => void;
}) {
  const reroute = useServerFn(rerouteFromHere);
  const logOverride = useServerFn(logTripOverride);
  const copy = COPY[kind];

  const { data, isLoading } = useQuery({
    queryKey: [
      "live-replan",
      kind,
      fix.lat.toFixed(4),
      fix.lng.toFixed(4),
      active.to.lat,
      active.to.lng,
    ],
    queryFn: () =>
      reroute({
        data: {
          from: { lat: fix.lat, lng: fix.lng, label: "Here" },
          to: { lat: active.to.lat, lng: active.to.lng, label: active.to.label },
        },
      }),
    staleTime: 30_000,
  });

  const options = data?.itineraries ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-sm">
      <div className="w-full rounded-t-[32px] bg-limestone ring-1 ring-line max-h-[85vh] overflow-y-auto p-6 animate-rise">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
              {copy.eyebrow}
            </p>
            <h2 className="mt-1 font-display text-[28px] leading-tight text-ink">
              {copy.title}
            </h2>
            <p className="mt-1 text-[13px] text-ink-soft">{copy.sub}</p>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft"
          >
            Close
          </button>
        </div>

        {isLoading && (
          <p className="mt-4 text-[13px] text-ink-soft">Searching nearby buses…</p>
        )}
        {!isLoading && options.length === 0 && (
          <p className="mt-4 text-[13px] text-ink-soft">
            No fresh options found — sit tight, we'll keep tracking.
          </p>
        )}

        <ul className="mt-5 space-y-3">
          {options.map((it) => {
            const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
            const summary =
              rides.length === 0
                ? "Walk only"
                : rides.map((r) => `Bus ${r.routeShort}`).join(" → ");
            return (
              <li key={it.id}>
                <button
                  onClick={() => {
                    setActiveTrip({
                      ...active,
                      itinerary: it,
                      option: synthesizeOption(it),
                      legState: initialLegState(),
                    });
                    void logOverride({
                      data: {
                        deviceId: getDeviceId(),
                        from: { lat: active.from.lat, lng: active.from.lng },
                        to: { lat: active.to.lat, lng: active.to.lng },
                        plannedLegs: (active.itinerary?.legs ?? []) as unknown[],
                        actualLegs: it.legs as unknown[],
                        kind: `live-replan:${kind}`,
                      },
                    }).catch(() => {});
                    onClose();
                  }}
                  className="w-full text-left rounded-[24px] bg-card ring-1 ring-line p-4 hover:ring-aegean-deep transition"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {summary} · {it.transfers === 0 ? "no change" : `${it.transfers} change`}
                  </p>
                  <p className="mt-1 font-display text-[20px] leading-tight text-ink">
                    {fmtMin(it.totalDurationSec)} to {active.to.label}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-soft">
                    {Math.round(it.totalWalkMeters)} m walking total
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-card ring-1 ring-line px-5 py-3 text-[13px] text-ink-soft"
        >
          Keep current trip
        </button>
      </div>
    </div>
  );
}
