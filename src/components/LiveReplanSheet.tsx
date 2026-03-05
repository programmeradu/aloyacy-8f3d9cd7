// Live re-plan sheet. Opens from the DisruptionBanner CTA mid-trip when
// the rider is running late, missed a connection, or wants a different
// route from where they currently are. Mirrors EarlyAlightSheet's pattern
// (reroute → swap ActiveTrip) but with disruption-aware copy.

import { useEffect, useMemo } from "react";
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
import { track } from "@/lib/analytics";
import { distanceM } from "@/lib/geo";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import type { JourneyOption } from "@/lib/journey.server";
import type { DisruptionKind } from "@/lib/useDisruptionWatch";
import { useI18n, type DictKey } from "@/lib/i18n";

function useFmtMin() {
  const { t } = useI18n();
  return (s: number) => `${Math.max(0, Math.round(s / 60))} ${t("common.minUnit")}`;
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

const COPY: Record<DisruptionKind, { eyebrow: DictKey; title: DictKey; sub: DictKey }> = {
  "missed-connection": {
    eyebrow: "replan.missed.eyebrow",
    title: "replan.missed.title",
    sub: "replan.missed.sub",
  },
  "running-late": {
    eyebrow: "replan.late.eyebrow",
    title: "replan.late.title",
    sub: "replan.late.sub",
  },
  "connection-at-risk": {
    eyebrow: "replan.atRisk.eyebrow",
    title: "replan.atRisk.title",
    sub: "replan.atRisk.sub",
  },
  "vehicle-lost-feed": {
    eyebrow: "replan.lostFeed.eyebrow",
    title: "replan.lostFeed.title",
    sub: "replan.lostFeed.sub",
  },
  "ghost-pre-board": {
    eyebrow: "replan.ghostPreBoard.eyebrow",
    title: "replan.ghostPreBoard.title",
    sub: "replan.ghostPreBoard.sub",
  },
  "late-pre-board": {
    eyebrow: "replan.latePreBoard.eyebrow",
    title: "replan.latePreBoard.title",
    sub: "replan.latePreBoard.sub",
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
  const { t } = useI18n();
  const fmtMin = useFmtMin();
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
  useEffect(() => {
    track("ui:live-replan.open", { kind });
  }, [kind]);
  useEffect(() => {
    if (data) {
      track("ai:live-replan.options", { kind, count: options.length });
    }
  }, [data, kind, options.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-sm">
      <div className="w-full rounded-t-[32px] bg-limestone ring-1 ring-line max-h-[85vh] overflow-y-auto p-6 animate-rise">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
              {t(copy.eyebrow)}
            </p>
            <h2 className="mt-1 font-display text-[28px] leading-tight text-ink">
              {t(copy.title)}
            </h2>
            <p className="mt-1 text-[13px] text-ink-soft">{t(copy.sub)}</p>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft"
          >
            {t("replan.close")}
          </button>
        </div>

        {isLoading && (
          <p className="mt-4 text-[13px] text-ink-soft">{t("replan.searching")}</p>
        )}
        {!isLoading && options.length === 0 && (
          <p className="mt-4 text-[13px] text-ink-soft">{t("replan.empty")}</p>
        )}

        <ul className="mt-5 space-y-3">
          {options.map((it) => {
            const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
            const summary =
              rides.length === 0
                ? t("replan.walkOnly")
                : rides.map((r) => t("replan.bus", { code: r.routeShort })).join(" → ");
            return (
              <li key={it.id}>
                <button
                  onClick={() => {
                    track("ui:live-replan.select", {
                      kind,
                      transfers: it.transfers,
                      totalSec: it.totalDurationSec,
                    });
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
                    {summary} — {it.transfers === 0 ? t("replan.noChange") : t("replan.changes", { n: it.transfers })}
                  </p>
                  <p className="mt-1 font-display text-[20px] leading-tight text-ink">
                    {t("replan.headToDest", { mins: fmtMin(it.totalDurationSec), dest: active.to.label })}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-soft">
                    {t("replan.walkingTotal", { m: Math.round(it.totalWalkMeters) })}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <WalkOutOption fix={fix} active={active} kind={kind} />

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-card ring-1 ring-line px-5 py-3 text-[13px] text-ink-soft"
        >
          {t("replan.keepCurrent")}
        </button>
      </div>
    </div>
  );
}

// Walking detour factor — straight-line × 1.3 approximates real street paths
// closely enough for a "should I walk?" decision. We cap surfacing at ~25 min
// so we never propose marathon walks as a serious option.
const WALK_DETOUR_FACTOR = 1.3;
const WALK_SPEED_MPS = 1.3; // ~4.7 km/h, comfortable everyday pace
const WALK_MAX_SEC = 25 * 60;

function WalkOutOption({
  fix,
  active,
  kind,
}: {
  fix: { lat: number; lng: number };
  active: ActiveTrip;
  kind: DisruptionKind;
}) {
  const { t } = useI18n();
  const walk = useMemo(() => {
    const straightM = distanceM(fix, { lat: active.to.lat, lng: active.to.lng });
    const walkM = straightM * WALK_DETOUR_FACTOR;
    const sec = Math.round(walkM / WALK_SPEED_MPS);
    return sec <= WALK_MAX_SEC ? { sec, m: Math.round(walkM) } : null;
  }, [fix, active.to.lat, active.to.lng]);
  if (!walk) return null;
  const url = `https://www.google.com/maps/dir/?api=1&origin=${fix.lat},${fix.lng}&destination=${active.to.lat},${active.to.lng}&travelmode=walking`;
  const mins = Math.max(1, Math.round(walk.sec / 60));
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("ui:live-replan.walk-out", { kind, sec: walk.sec, m: walk.m })}
      className="mt-4 flex items-center justify-between rounded-[24px] bg-aegean-soft/40 ring-1 ring-aegean/30 p-4 hover:ring-aegean-deep transition"
    >
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegean-deep">
          {t("replan.walkInsteadCta")}
        </p>
        <p className="mt-1 font-display text-[18px] leading-tight text-ink">
          {t("replan.walkInstead", { mins })}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          {t("replan.walkingTotal", { m: walk.m })}
        </p>
      </div>
      <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.18em] text-aegean-deep">
        ↗
      </span>
    </a>
  );
}
