// Multi-leg trip companion. Renders the full N-leg journey with leg-aware
// status card, dual-vehicle map indicator (current + connecting bus), and
// per-leg action buttons. Used in place of the single-leg `TripCompanion`
// when `active.itinerary` has ≥ 2 ride legs.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { IconArrowLeft, IconArrowUpRight, IconBus, IconClock, IconPin } from "@/components/Icons";
import { routeTone, getStop } from "@/lib/gtfs";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import {
  multiLegConfirmOnBoard,
  multiLegMarkAlighted,
  multiLegMarkArrived,
  useMultiLegJourney,
  type MultiLegLive,
} from "@/lib/useMultiLegJourney";

import { startLiveTracking } from "@/lib/useJourney";
import { useResumeRefresh, useInvalidateRealtime } from "@/lib/useRealtime";
import { requestCompassPermission } from "@/lib/useCompass";
import type { Itinerary, Leg, RideLeg, WalkLeg, WaitLeg } from "@/lib/itinerary-types";
import { WalkGuidance } from "@/components/WalkGuidance";
import { LiveWalkBanner } from "@/components/LiveWalkBanner";
import { SightingButton } from "@/components/SightingButton";
import { LastMileChainCard } from "@/components/LastMileChainCard";
import { suggestLastMileChain } from "@/lib/last-mile-chain.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LongFinalWalkHint } from "@/components/LongFinalWalkHint";
import { ShortcutPrompt } from "@/components/ShortcutPrompt";
import { EarlyAlightSheet } from "@/components/EarlyAlightSheet";
import { LiveReplanSheet } from "@/components/LiveReplanSheet";
import { CrowdHint } from "@/components/CrowdHint";
import { DisruptionBanner } from "@/components/DisruptionBanner";
import { useDisruptionWatch } from "@/lib/useDisruptionWatch";
import { useShortcutDetector } from "@/lib/useShortcutDetector";
import { useTrainingSignals } from "@/lib/useTrainingSignals";
import { distanceM } from "@/lib/geo";
import { fmtEta as fmtMin, fmtClock as fmtTime } from "@/lib/journey-copy";
import { useI18n } from "@/lib/i18n";
import companionHero from "@/assets/companion-hero.jpg";

export function MultiLegCompanion({ active }: { active: ActiveTrip }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const itin = active.itinerary!;
  const live = useMultiLegJourney(active);
  const tripId = active.option.id;
  const [earlyAlightOpen, setEarlyAlightOpen] = useState(false);
  const [liveReplanOpen, setLiveReplanOpen] = useState(false);
  const disruption = useDisruptionWatch(active, live);

  // Force a fresh realtime fetch when rider returns to the tab after >30s away.
  const invalidateRt = useInvalidateRealtime();
  useResumeRefresh(invalidateRt, 30);

  // Shortcut detector: prompt to walk the rest when destination is in reach.
  const isOnFinalWalk =
    live.currentLeg?.kind === "walk" &&
    live.currentLegIndex === itin.legs.length - 1;
  const shortcut = useShortcutDetector({
    active,
    fix: live.fix,
    currentLegIndex: live.currentLegIndex,
    isOnFinalWalk,
  });

  // Wave 3 — Last-mile chain. When the final walk to destination is long
  // (or moderately long after-hours), pre-fetch a taxi handoff so it's
  // ready the moment the rider hits the walking-to-destination phase.
  // Server applies the real trigger gates and returns null when nothing
  // would actually help.
  const chainFn = useServerFn(suggestLastMileChain);
  const finalLeg = itin.legs[itin.legs.length - 1];
  const finalWalk = finalLeg?.kind === "walk" ? finalLeg : null;
  const chainQuery = useQuery({
    queryKey: [
      "lastMileChain",
      tripId,
      finalWalk?.from.lat,
      finalWalk?.from.lng,
      active.to.lat,
      active.to.lng,
      itin.arrivalUnix,
    ],
    queryFn: async () => {
      if (!finalWalk) return null;
      if (finalWalk.distanceMeters < 800) return null;
      try {
        return await chainFn({
          data: {
            alight: {
              lat: finalWalk.from.lat,
              lng: finalWalk.from.lng,
              name: finalWalk.from.name,
            },
            destination: {
              lat: active.to.lat,
              lng: active.to.lng,
              name: active.to.label,
            },
            arrivalUnix: itin.arrivalUnix,
            finalWalkMeters: Math.round(finalWalk.distanceMeters),
          },
        });
      } catch {
        return null;
      }
    },
    // Pre-fetch the moment we know an itinerary exists — riders alight
    // suddenly, the card must be there instantly, not after a network hop.
    enabled: !!finalWalk && finalWalk.distanceMeters >= 800,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  const lastMileChain = chainQuery.data ?? null;

  // Emit training events (walk-complete, transfer-made/missed) into the
  // learning pipeline.
  useTrainingSignals(active, live);

  // "I'm off" handler — if the rider is well clear of the planned alight
  // stop, they got off at the wrong place. Open the re-route sheet instead
  // of marking alighted (which would auto-advance to the wrong walk leg).
  const EARLY_ALIGHT_THRESHOLD_M = 150;
  const handleImOff = () => {
    const alight = live.currentRideLeg?.alight;
    const dist =
      live.fix && alight ? distanceM(live.fix, { lat: alight.lat, lng: alight.lng }) : 0;
    if (dist > EARLY_ALIGHT_THRESHOLD_M) {
      setEarlyAlightOpen(true);
    } else {
      multiLegMarkAlighted();
    }
  };

  // Map center / span — fit to whole itinerary footprint.
  const bounds = useMemo(() => boundsFor(itin), [itin]);

  // Dual-vehicle map: show both the current and (when connecting) the next
  // leg's vehicles. We pass tripIds via `restrictTripIds` so MapPreview
  // renders both — it already supports that without focusing.
  const restrictTripIds = useMemo(() => {
    const ids: string[] = [];
    if (live.currentRideLeg) ids.push(live.currentRideLeg.tripId);
    if (
      live.nextRideLeg &&
      (live.phase === "walking-to-transfer" ||
        live.phase === "waiting-for-connection")
    ) {
      ids.push(live.nextRideLeg.tripId);
    }
    return ids.length > 0 ? ids : undefined;
  }, [live.currentRideLeg, live.nextRideLeg, live.phase]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    out.push({ lat: active.from.lat, lng: active.from.lng, kind: "origin", label: active.from.label });
    out.push({ lat: active.to.lat, lng: active.to.lng, kind: "destination", label: active.to.label });
    // Drop a pin at every board + alight stop so the rider sees the chain.
    for (const leg of itin.legs) {
      if (leg.kind === "ride") {
        out.push({ lat: leg.board.lat, lng: leg.board.lng, kind: "stop", label: leg.board.name, tone: "aegean" });
        out.push({ lat: leg.alight.lat, lng: leg.alight.lng, kind: "stop", label: leg.alight.name, tone: "ochre" });
      }
    }
    return out;
  }, [itin, active.from, active.to]);

  return (
    <AppShell>
      {/* Top bar */}
      <div className="px-6 pt-2 pb-4 flex items-center justify-between animate-rise">
        <Link
          to="/trips"
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("ml.rideOfN", {
            label: itin.transfers === 1 ? t("ml.changesOne") : t("ml.changesN", { n: itin.transfers }),
            n: Math.max(1, live.rideOrdinal),
            total: live.totalRides,
          })}
        </span>
        <button
          onClick={() => {
            clearActiveTrip();
            void navigate({ to: "/trips" });
          }}
          className="rounded-full bg-ink px-4 py-2 font-sans text-[12px] font-semibold tracking-tight text-limestone shadow-sm hover:bg-ink/90 active:scale-[0.98] transition"
        >
          {t("trip.endTrip")}
        </button>
      </div>

      {/* Hero status card */}
      <section className="px-6 animate-rise" style={{ animationDelay: "60ms" }}>
        <article className="relative overflow-hidden rounded-[32px] bg-card ring-1 ring-line">
          <img
            src={companionHero}
            alt=""
            aria-hidden
            loading="lazy"
            width={1280}
            height={896}
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.18] mix-blend-multiply"
          />
          <div className="relative p-6">
            <PhaseLabel live={live} itin={itin} />
            <PhaseHeadline live={live} itin={itin} />
            <PhaseSub live={live} itin={itin} destLabel={active.to.label} />
          </div>
        </article>
      </section>

      {/* Resilience banners */}
      {live.active && live.tripGhost && !live.vehicleLost && (
        <div className="mt-3"><StaleFeedBanner variant="ghost-bus" /></div>
      )}
      {live.active && live.vehicleLost && (
        <div className="mt-3"><StaleFeedBanner variant="vehicle-lost" /></div>
      )}
      {live.active && !live.vehicleLost && !live.tripGhost && live.feedStale && (
        <div className="mt-3"><StaleFeedBanner variant="feed-stale" /></div>
      )}
      {live.active &&
        (live.phase === "walking-to-transfer" || live.phase === "waiting-for-connection") &&
        live.nextRideLeg &&
        !live.nextVehicleTracked && (
          <div className="mt-3"><StaleFeedBanner variant="next-not-tracked" /></div>
        )}

      {/* Rider-confirmed sighting CTA — appears next to ghost/vehicle-lost banners
          so a rider physically near the bus can rescue the trip. */}
      {live.active && (live.tripGhost || live.vehicleLost) && live.currentRideLeg && (
        <div className="mt-3 px-6">
          <SightingButton
            tripId={live.currentRideLeg.tripId}
            routeId={live.currentRideLeg.routeId}
            stopId={live.currentRideLeg.board.stopId}
            lat={live.currentRideLeg.board.lat}
            lng={live.currentRideLeg.board.lng}
          />
        </div>
      )}
      {live.active &&
        (live.phase === "walking-to-transfer" || live.phase === "waiting-for-connection") &&
        live.nextRideLeg &&
        !live.nextVehicleTracked && (
          <div className="mt-3 px-6">
            <SightingButton
              tripId={live.nextRideLeg.tripId}
              routeId={live.nextRideLeg.routeId}
              stopId={live.nextRideLeg.board.stopId}
              lat={live.nextRideLeg.board.lat}
              lng={live.nextRideLeg.board.lng}
            />
          </div>
        )}


      {/* Proactive disruption assistant */}
      <DisruptionBanner
        signal={disruption}
        onReplan={live.fix ? () => setLiveReplanOpen(true) : undefined}
      />



      {/* Wrong-stop adaptive hint while walking to board */}
      {live.active && live.rerouteHint?.kind === "switch-boarding" && (
        <section className="px-6 mt-3 animate-rise">
          <div className="rounded-[22px] bg-aegean-soft/50 ring-1 ring-aegean/30 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
              {t("ml.boardingAdjusted")}
            </p>
            <p className="mt-1 text-[13px] text-ink">
              {t("ml.boardingAdjustedBody", { name: live.rerouteHint.newStopName })}
            </p>
          </div>
        </section>
      )}
      {live.active && live.rerouteHint?.kind === "offer-replan" && (
        <section className="px-6 mt-3 animate-rise">
          <div className="rounded-[22px] bg-ochre-soft/60 ring-1 ring-ochre/30 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
              {t("ml.differentStop")}
            </p>
            <p className="mt-1 text-[13px] text-ink">
              {live.rerouteHint.reason}
            </p>
            <button
              onClick={() => setEarlyAlightOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12px] text-limestone"
            >
              {t("ml.replanFromHere")}
            </button>
          </div>
        </section>
      )}

      {/* Crowd / comfort prediction during ride or wait. Folds in weather
          at the alight stop for intercity routes (longer rides where the
          weather at arrival actually changes the decision). */}
      {live.active &&
        (live.phase === "riding" || live.phase === "alight-soon" || live.phase === "waiting-to-board") &&
        live.currentRideLeg && (
          <CrowdHint
            routeId={live.currentRideLeg.routeId}
            tripId={live.currentRideLeg.tripId}
            weatherAt={
              getStop(live.currentRideLeg.alight.stopId)?.agency === "IC"
                ? { lat: live.currentRideLeg.alight.lat, lng: live.currentRideLeg.alight.lng }
                : null
            }
          />
        )}

      {/* Live map with current (+ next) vehicle */}
      <section className="mt-5 px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MapPreview
          height="h-56"
          center={bounds.center}
          spanKm={bounds.spanKm}
          markers={mapMarkers}
          liveVehicles
          restrictTripIds={restrictTripIds}
          vehicleOverrides={
            live.fusedCurrentVehicle
              ? { [live.fusedCurrentVehicle.tripId]: live.fusedCurrentVehicle }
              : undefined
          }
          userLocation={
            live.fix
              ? { lat: live.fix.lat, lng: live.fix.lng, accuracyM: live.fix.accuracyM, headingDeg: live.fix.headingDeg }
              : null
          }
        />
      </section>

      {/* Action HUD */}
      <div className="mt-6">
        <MultiLegActions live={live} active={active} onImOff={handleImOff} />
      </div>

      {/* Skip-ahead prompt when destination is in reach. */}
      {shortcut.shouldPrompt && live.fix && (
        <ShortcutPrompt
          active={active}
          fix={{ lat: live.fix.lat, lng: live.fix.lng }}
          distanceM={shortcut.distanceM}
          onDismiss={shortcut.dismiss}
        />
      )}

      {/* Early-alight re-route sheet. */}
      {earlyAlightOpen && live.fix && (
        <EarlyAlightSheet
          active={active}
          fix={{ lat: live.fix.lat, lng: live.fix.lng }}
          onClose={() => setEarlyAlightOpen(false)}
        />
      )}

      {/* Live re-plan sheet — opens from the disruption banner CTA. */}
      {liveReplanOpen && live.fix && disruption && (
        <LiveReplanSheet
          active={active}
          fix={{ lat: live.fix.lat, lng: live.fix.lng }}
          kind={disruption.kind}
          onClose={() => setLiveReplanOpen(false)}
        />
      )}


      {/* Turn-by-turn for any walk leg — initial, transfer, or final.
          LiveWalkBanner gives the rider the imminent maneuver + meters
          countdown once GPS is live; WalkGuidance carries the full step
          list (with Street View imagery) below it. */}
      {live.currentLeg?.kind === "walk" && (
        <>
          {live.phase === "walking-to-destination" && (
            <LongFinalWalkHint
              from={{ lat: live.currentLeg.from.lat, lng: live.currentLeg.from.lng }}
              to={{ lat: live.currentLeg.to.lat, lng: live.currentLeg.to.lng }}
              distanceMeters={live.currentLeg.distanceMeters}
              durationSec={live.currentLeg.durationSec}
              destinationLabel={active.to.label}
            />
          )}
          {live.phase === "walking-to-destination" && lastMileChain && (
            <section className="mt-3 px-6 animate-rise">
              <LastMileChainCard suggestion={lastMileChain} />
            </section>
          )}
          <LiveWalkBanner
            from={{ lat: live.currentLeg.from.lat, lng: live.currentLeg.from.lng }}
            to={{ lat: live.currentLeg.to.lat, lng: live.currentLeg.to.lng }}
            fix={live.fix}
            title={
              live.phase === "walking-to-board"
                ? t("ml.walk.toFirst")
                : live.phase === "walking-to-transfer"
                  ? t("ml.walk.toBus", { code: live.nextRideLeg?.routeShort ?? "" })
                  : live.phase === "walking-to-destination"
                    ? t("ml.walk.toDest")
                    : t("ml.walk.generic")
            }
          />
          <WalkGuidance
            from={{ lat: live.currentLeg.from.lat, lng: live.currentLeg.from.lng }}
            to={{ lat: live.currentLeg.to.lat, lng: live.currentLeg.to.lng }}
            title={
              live.phase === "walking-to-board"
                ? t("ml.walk.toFirst")
                : live.phase === "walking-to-transfer"
                  ? t("ml.walk.toBus", { code: live.nextRideLeg?.routeShort ?? "" })
                  : live.phase === "walking-to-destination"
                    ? t("ml.walk.toDest")
                    : t("ml.walk.generic")
            }
          />
        </>
      )}

      {/* Timeline of every leg with current highlighted */}
      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">{t("trip.yourJourney")}</h2>
          <span className="font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
            {t("ml.minArr", { m: Math.round(itin.totalDurationSec / 60), t: fmtTime(itin.arrivalUnix) })}
          </span>
        </div>

        <ol className="relative rounded-[28px] bg-card ring-1 ring-line p-5 space-y-4">
          {itin.legs.map((leg, i) => (
            <LegTimelineRow
              key={i}
              leg={leg}
              isActive={i === live.currentLegIndex}
              isDone={i < live.currentLegIndex || live.phase === "arrived"}
            />
          ))}
        </ol>

        <p className="mt-3 font-sans text-[11px] font-medium text-ink-soft/70 tabular-nums">
          Trip {tripId.slice(0, 12)}
        </p>
      </section>
    </AppShell>
  );
}

// ---- Hero copy components ------------------------------------------------

function PhaseLabel({ live, itin }: { live: MultiLegLive; itin: Itinerary }) {
  const { t } = useI18n();
  const tone =
    live.phase === "arrived"
      ? "text-olive"
      : live.phase === "alight-soon"
        ? "text-ochre"
        : live.nextBoardLate
          ? "text-ochre"
          : "text-aegean-deep";
  const text =
    live.phase === "idle"
      ? t("ml.phase.ready")
      : live.phase === "walking-to-board"
        ? t("ml.phase.walkFirst")
        : live.phase === "waiting-to-board"
          ? t("ml.phase.waitFor", { code: live.currentRideLeg?.routeShort ?? "" })
          : live.phase === "riding"
            ? t("ml.phase.onBus", { code: live.currentRideLeg?.routeShort ?? "", n: live.rideOrdinal, total: live.totalRides })
            : live.phase === "alight-soon"
              ? t("ml.phase.alightNext")
              : live.phase === "walking-to-transfer"
                ? t("ml.phase.walkToBus", { code: live.nextRideLeg?.routeShort ?? "" })
                : live.phase === "waiting-for-connection"
                  ? t("ml.phase.waitFor", { code: live.nextRideLeg?.routeShort ?? "" })
                  : live.phase === "walking-to-destination"
                    ? t("ml.phase.finalWalk")
                    : t("ml.phase.arrived");
  const detail =
    live.phase === "waiting-for-connection" && live.nextRideLeg
      ? live.nextBoardLate
        ? t("ml.detail.late")
        : live.nextBoardSource === "live"
          ? t("ml.detail.liveTracking")
          : t("ml.detail.scheduled")
      : itin.source === "live"
        ? t("ml.detail.live")
        : itin.source === "mixed"
          ? t("ml.detail.mixed")
          : t("ml.detail.scheduled");
  return (
    <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${tone}`}>
      {text} <span className="text-ink-soft">— {detail}</span>
    </p>
  );
}

function PhaseHeadline({ live, itin }: { live: MultiLegLive; itin: Itinerary }) {
  const { t } = useI18n();
  const base = "mt-2 font-display text-[36px] leading-[1.05] text-ink text-balance";
  if (live.phase === "walking-to-board" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.walkTo")} <span className="text-aegean-deep">{live.currentRideLeg.board.name}</span>
        <br />
        <span className="italic text-olive-soft">{t("ml.hl.busInBoard", { code: live.currentRideLeg.routeShort, min: fmtMin(live.secsToCurrentBoard) })}</span>
      </h1>
    );
  }
  if (live.phase === "waiting-to-board" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.busIn", { code: live.currentRideLeg.routeShort })}{" "}
        <span className="text-aegean-deep">{Math.max(0, Math.round(live.secsToCurrentBoard / 60))}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">{t("common.minUnit")}</span>
        <br />
        <span className="italic text-olive-soft">{t("ml.hl.atName", { name: live.currentRideLeg.board.name })}</span>
      </h1>
    );
  }
  if (live.phase === "riding" && live.currentRideLeg) {
    const tail = live.nextRideLeg
      ? t("ml.hl.atNameThenChange", { name: live.currentRideLeg.alight.name, code: live.nextRideLeg.routeShort })
      : t("ml.hl.atNameDot", { name: live.currentRideLeg.alight.name });
    return (
      <h1 className={base}>
        {t("ml.hl.offIn")} <span className="text-aegean-deep">{Math.max(0, Math.round(live.secsToCurrentAlight / 60))}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">{t("common.minUnit")}</span>
        <br />
        <span className="italic text-olive-soft">{tail}</span>
      </h1>
    );
  }
  if (live.phase === "alight-soon" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.stepOff")} <span className="text-ochre">{t("ml.hl.next")}</span>
        <br />
        <span className="italic text-olive-soft">{live.currentRideLeg.alight.name}.</span>
      </h1>
    );
  }
  if (live.phase === "walking-to-transfer" && live.nextRideLeg && live.currentLeg?.kind === "walk") {
    return (
      <h1 className={base}>
        {t("ml.hl.walkTo")} <span className="text-aegean-deep">{live.nextRideLeg.board.name}</span>
        <br />
        <span className="italic text-olive-soft">
          {t("ml.hl.walkForBus", { code: live.nextRideLeg.routeShort, min: fmtMin(live.currentLeg.durationSec) })}
        </span>
      </h1>
    );
  }
  if (live.phase === "waiting-for-connection" && live.nextRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.busIn", { code: live.nextRideLeg.routeShort })}{" "}
        <span className={live.nextBoardLate ? "text-ochre" : "text-aegean-deep"}>
          {Math.max(0, Math.round(live.secsToNextBoard / 60))}
        </span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">{t("common.minUnit")}</span>
        <br />
        <span className="italic text-olive-soft">{t("ml.hl.atName", { name: live.nextRideLeg.board.name })}</span>
      </h1>
    );
  }
  if (live.phase === "walking-to-destination") {
    return (
      <h1 className={base}>
        {t("ml.hl.finalStretch")}
        <br />
        <span className="italic text-olive-soft">{t("ml.hl.minOnFoot", { m: Math.max(0, Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60)) })}</span>
      </h1>
    );
  }
  if (live.phase === "arrived") {
    return (
      <h1 className={base}>
        {t("ml.hl.youreThere")} <span className="text-olive">{t("ml.hl.there")}</span>
        <br />
        <span className="italic text-olive-soft">{t("ml.hl.welcome")}</span>
      </h1>
    );
  }
  // idle — pre-start preview
  const firstRide = itin.legs.find((l): l is RideLeg => l.kind === "ride");
  return (
    <h1 className={base}>
      {t("ml.hl.doorToDoor")} <span className="text-aegean-deep">{Math.round(itin.totalDurationSec / 60)}</span>
      <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">{t("common.minUnit")}</span>
      <br />
      <span className="italic text-olive-soft">
        {t("ml.hl.startingOn", { code: firstRide?.routeShort ?? "" })}
      </span>
    </h1>
  );
}

function PhaseSub({
  live,
  itin,
  destLabel,
}: {
  live: MultiLegLive;
  itin: Itinerary;
  destLabel: string;
}) {
  const { t } = useI18n();
  const changesLabel = itin.transfers === 1 ? t("ml.changesOne") : t("ml.changesN", { n: itin.transfers });
  const text =
    live.phase === "idle"
      ? t("ml.sub.idle", { changes: changesLabel })
      : live.phase === "walking-to-board"
        ? t("ml.sub.walkBoard")
        : live.phase === "waiting-to-board"
          ? t("ml.sub.waitBoard")
          : live.phase === "riding"
            ? live.nextRideLeg
              ? t("ml.sub.ridingChange", { code: live.nextRideLeg.routeShort, name: live.currentRideLeg?.alight.name ?? "" })
              : t("ml.sub.ridingSit")
            : live.phase === "alight-soon"
              ? live.nextRideLeg
                ? t("ml.sub.alightChange", { name: live.nextRideLeg.board.name, code: live.nextRideLeg.routeShort })
                : t("ml.sub.alightFinal", { name: destLabel })
              : live.phase === "walking-to-transfer"
                ? live.nextRideLeg
                  ? t("ml.sub.walkTransfer", { code: live.nextRideLeg.routeShort, min: fmtMin(live.secsToNextBoard) })
                  : t("ml.sub.walkTransferNo")
                : live.phase === "waiting-for-connection"
                  ? live.nextBoardLate
                    ? t("ml.sub.waitConnLate", { m: Math.round((live.secsToNextBoard - (live.nextRideLeg?.board.departureUnix ?? 0) + Math.floor(Date.now()/1000)) / 60) })
                    : t("ml.sub.waitConn")
                  : live.phase === "walking-to-destination"
                    ? t("ml.sub.finalWalk", { m: Math.max(0, Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60)), name: destLabel })
                    : t("ml.sub.welcome", { name: destLabel });
  return (
    <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-soft leading-relaxed">
      <IconClock className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
      <span>{text}</span>
    </p>
  );
}

// ---- Action HUD ----------------------------------------------------------

function MultiLegActions({ live, active, onImOff }: { live: MultiLegLive; active: ActiveTrip; onImOff: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  if (!live.active) {
    return (
      <section className="px-6 animate-rise" style={{ animationDelay: "100ms" }}>
        <div className="rounded-[28px] bg-aegean-soft/40 ring-1 ring-aegean/20 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            {t("hud.liveGuidance")}
          </p>
          <p className="mt-2 font-display text-[26px] leading-tight text-ink">
            {t("ml.act.startTitle", { name: active.to.label })}
          </p>
          <p className="mt-2 text-[13px] text-ink-soft">
            {t("ml.act.startBody")}
          </p>
          <button
            type="button"
            onClick={() => {
              // Start immediately so the UI flips into live mode even if
              // the compass permission prompt stalls or the user dismisses
              // it. Compass is an enhancement, not a gate.
              startLiveTracking();
              void requestCompassPermission().catch(() => {});
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone active:scale-[0.98] transition"
          >
            {t("ml.act.startCta")}
            <IconArrowUpRight className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "waiting-to-board") {
    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            {t("ml.act.onBoardQ", { code: live.currentRideLeg?.routeShort ?? "" })}
          </p>
          <p className="mt-2 text-[13px] text-ink-soft">
            {t("ml.act.onBoardBody", { name: live.currentRideLeg?.alight.name ?? "" })}
          </p>
          <button
            onClick={() => multiLegConfirmOnBoard()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            {t("ml.act.onBoardCta")}
            <IconBus className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "alight-soon") {
    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-ochre-soft ring-1 ring-ochre/40 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
            {t("ml.act.pressStop")}
          </p>
          <p className="mt-2 font-display text-[26px] leading-tight text-ink">
            {live.currentRideLeg?.alight.name}
          </p>
          <button
            onClick={onImOff}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            {t("ml.act.imOff")}
            <IconPin className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "walking-to-destination") {
    const walkMin = Math.max(
      0,
      Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60),
    );
    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
            {t("ml.act.finalLabel", { m: walkMin })}
          </p>
          <p className="mt-2 font-display text-[22px] leading-tight text-ink">
            {t("ml.act.finalTitle", { name: active.to.label })}
          </p>
          <p className="mt-2 text-[13px] text-ink-soft">
            {t("ml.act.finalBody")}
          </p>
          <button
            onClick={() => multiLegMarkArrived()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            {t("ml.act.imHere")}
            <IconPin className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "arrived") {
    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-olive-soft ring-1 ring-olive/30 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
            {t("hud.arrived.label")}
          </p>
          <p className="mt-2 font-display text-[26px] leading-tight text-ink">
            {t("hud.arrived.title", { name: active.to.label })}
          </p>
          <button
            onClick={() => {
              clearActiveTrip();
              void navigate({ to: "/" });
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            {t("hud.arrived.done")}
          </button>
        </div>
      </section>
    );
  }

  // Other phases: just show a calm "we've got you" pill.
  return (
    <section className="px-6 animate-rise">
      <div className="flex items-center gap-3 rounded-full bg-card ring-1 ring-line px-5 py-3 text-[12px] text-ink-soft">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-aegean-deep/50 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-aegean-deep" />
        </span>
        <span>{t("ml.tracking")}</span>
      </div>
    </section>
  );
}

// ---- Timeline row --------------------------------------------------------

function LegTimelineRow({
  leg,
  isActive,
  isDone,
}: {
  leg: Leg;
  isActive: boolean;
  isDone: boolean;
}) {
  const { t } = useI18n();
  const ring = isDone
    ? "bg-olive/10 text-olive ring-olive/20"
    : isActive
      ? "bg-aegean-deep text-white ring-aegean-deep"
      : "bg-limestone-soft text-ink-soft ring-line";

  let glyph: React.ReactNode = null;
  let title: React.ReactNode = null;
  let sub: React.ReactNode = null;
  let accent: React.ReactNode = null;

  if (leg.kind === "ride") {
    glyph = <IconBus className="size-3.5" />;
    title = (
      <>
        {t("ml.timeline.boardPrefix")} <span className="text-aegean-deep">{t("trip.boardBusName", { code: leg.routeShort })}</span> — {leg.routeLong}
      </>
    );
    sub = t("ml.timeline.rideSub", {
      from: leg.board.name,
      to: leg.alight.name,
      dep: fmtTime(leg.board.departureUnix),
      arr: fmtTime(leg.alight.arrivalUnix),
      n: leg.stopCount,
    });
    accent = <RouteChip code={leg.routeShort} tone={routeTone(leg.routeId)} size="sm" />;
  } else if (leg.kind === "walk") {
    glyph = <IconPin className="size-3.5" />;
    title = (
      <>
        {t("ml.timeline.walkTo")} <span className="text-ink">{(leg as WalkLeg).to.name}</span>
      </>
    );
    sub = t("ml.timeline.walkSub", { min: fmtMin((leg as WalkLeg).durationSec), d: (leg as WalkLeg).distanceMeters });
  } else {
    glyph = <IconClock className="size-3.5" />;
    title = <>{t("ml.timeline.waitAt", { name: (leg as WaitLeg).name })}</>;
    sub = t("ml.timeline.waitSub", { min: fmtMin((leg as WaitLeg).durationSec) });
  }

  return (
    <li className="flex items-start gap-4">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${ring}`}>
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-display text-[19px] font-semibold leading-tight ${isActive ? "text-ink" : "text-ink-soft"}`}>
          {title}
        </p>
        <p className="mt-1 font-sans text-[13px] font-medium text-ink-soft leading-snug">
          {sub}
        </p>
      </div>
      {accent}
    </li>
  );
}

// ---- Geometry helpers ----------------------------------------------------

function boundsFor(it: Itinerary) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const leg of it.legs) {
    const pts: Array<{ lat: number; lng: number }> =
      leg.kind === "ride"
        ? [
            { lat: leg.board.lat, lng: leg.board.lng },
            { lat: leg.alight.lat, lng: leg.alight.lng },
          ]
        : leg.kind === "walk"
          ? [
              { lat: leg.from.lat, lng: leg.from.lng },
              { lat: leg.to.lat, lng: leg.to.lng },
            ]
          : [{ lat: leg.lat, lng: leg.lng }];
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
  }
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  // Rough span — 1 deg lat ≈ 111 km.
  const spanKm = Math.max(
    1.5,
    Math.max((maxLat - minLat) * 111, (maxLng - minLng) * 95) * 1.3,
  );
  return { center, spanKm };
}
