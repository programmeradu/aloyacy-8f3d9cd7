// Multi-leg trip companion. Renders the full N-leg journey with leg-aware
// status card, dual-vehicle map indicator (current + connecting bus), and
// per-leg action buttons. Used in place of the single-leg `TripCompanion`
// when `active.itinerary` has ≥ 2 ride legs.

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPreview } from "@/components/MapPreview";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ResumeTripPill } from "@/components/ResumeTripPill";
import { NotchCard } from "@/components/roam/NotchCard";
import { BackButton } from "@/components/roam/FrostButton";
import { Icon } from "@/components/roam/Icon";
import { useRoamI18n } from "@/lib/roam-i18n";
import { LegsTimeline, JLinePill } from "@/components/roam/journey/JourneyParts";
import { useJourneyMap } from "@/components/roam/journey/useJourneyMap";
import {
  cleanName,
  clock,
  fmtDist,
  fmtDur,
  journeyParts,
  mins,
  rideCalls,
  stopsLeft,
  towards,
  type ChangeInfo,
} from "@/components/roam/journey/journey-model";
import { MultiTripComplete } from "@/components/trip/TripComplete";
import type { RideLeg } from "@/lib/itinerary-types";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";
import { getStop } from "@/lib/gtfs";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import { multiLegMarkAlighted, useMultiLegJourney } from "@/lib/useMultiLegJourney";
import { useResumeRefresh, useInvalidateRealtime } from "@/lib/useRealtime";
import { WalkGuidance } from "@/components/WalkGuidance";
import { LiveWalkBanner } from "@/components/LiveWalkBanner";
import { SightingButton } from "@/components/SightingButton";
import { LastMileChainCard } from "@/components/LastMileChainCard";
import { useLastMileChain } from "@/lib/useLastMileChain";
import { LongFinalWalkHint } from "@/components/LongFinalWalkHint";
import { ShortcutPrompt } from "@/components/ShortcutPrompt";
import { EarlyAlightSheet } from "@/components/EarlyAlightSheet";
import { LiveReplanSheet } from "@/components/LiveReplanSheet";
import { CrowdHint } from "@/components/CrowdHint";
import { DisruptionBanner } from "@/components/DisruptionBanner";
import { useDisruptionWatch } from "@/lib/useDisruptionWatch";
import { useShortcutDetector } from "@/lib/useShortcutDetector";
import { useTrainingSignals } from "@/lib/useTrainingSignals";
import { boundsForItinerary } from "@aloya/core/itinerary-bounds";
import { shouldAskStillOnBoard, shouldOfferSighting } from "@aloya/core/multileg-banners";
import { useSparseSeedIds } from "@/lib/useSparseSeeds";
import { useI18n } from "@/lib/i18n";
import { PhaseLabel, PhaseHeadline, PhaseSub } from "@/components/multileg/PhaseCopy";
import { MultiLegActions } from "@/components/multileg/MultiLegActions";
import {
  buildMultiLegMapMarkers,
  getRestrictTripIds,
  isEarlyAlight,
  getWalkBannerTitle,
} from "@/lib/multileg-companion-helpers";

export function MultiLegCompanion({ active }: { active: ActiveTrip }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const seeds = useSparseSeedIds();
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
    live.currentLeg?.kind === "walk" && live.currentLegIndex === itin.legs.length - 1;
  const shortcut = useShortcutDetector({
    active,
    fix: live.fix,
    currentLegIndex: live.currentLegIndex,
    isOnFinalWalk,
  });

  const lastMileChain = useLastMileChain({ active });
  useTrainingSignals(active, live);

  const handleImOff = () => {
    const alight = live.currentRideLeg?.alight;
    if (isEarlyAlight(live.fix, alight)) {
      setEarlyAlightOpen(true);
    } else {
      multiLegMarkAlighted();
    }
  };

  const bounds = useMemo(() => boundsForItinerary(itin), [itin]);
  const restrictTripIds = useMemo(
    () => getRestrictTripIds(live.currentRideLeg, live.nextRideLeg, live.phase),
    [live.currentRideLeg, live.nextRideLeg, live.phase],
  );
  // Board and alight stops are drawn by the leg lines and pins; keep them in
  // the fitted view only.
  const mapMarkers = useMemo(
    () =>
      buildMultiLegMapMarkers(active, itin).map((m) =>
        m.kind === "stop" ? { ...m, kind: "bounds" as const } : m,
      ),
    [active, itin],
  );
  const { r } = useRoamI18n();
  const journeyMap = useJourneyMap(itin);
  const parts = useMemo(() => journeyParts(itin), [itin]);

  const walkBannerTitle = live.currentLeg
    ? getWalkBannerTitle(live.phase, live.nextRideLeg?.routeShort, t)
    : "";


  if (live.phase === "arrived") {
    return <MultiTripComplete active={active} itinerary={itin} />;
  }

  const lineList = parts.rides.map((x) => x.routeShort).join(", ");
  const rideNo = Math.max(1, live.rideOrdinal);

  return (
    <div className="roam r-page">
      <div className="r-col">
        <OfflineBanner />
        <div className="r-hero-map r-mapwrap" style={{ height: 420 }}>
          <div className="r-map-fill">
            <MapPreview
              bare
              center={bounds.center}
              spanKm={bounds.spanKm}
              segments={journeyMap.segments}
              markers={mapMarkers}
              pins={journeyMap.pins}
              declutterPx={28}
              fitPadding={{ top: 130, bottom: 110, left: 48, right: 48 }}
              liveVehicles
              restrictTripIds={restrictTripIds}
              vehicleOverrides={
                live.fusedCurrentVehicle
                  ? { [live.fusedCurrentVehicle.tripId]: live.fusedCurrentVehicle }
                  : undefined
              }
              userLocation={
                live.fix
                  ? {
                      lat: live.fix.lat,
                      lng: live.fix.lng,
                      accuracyM: live.fix.accuracyM,
                      headingDeg: live.fix.headingDeg,
                    }
                  : null
              }
              attribBottom={64}
            />
          </div>
          <div className="r-shade-top" style={{ height: 170 }} />
          <div className="r-shade-bottom" style={{ height: 120 }} />
          <header className="r-hero-head">
            <BackButton label={r("back")} fallback="/trips" />
            <div className="min-w-0 flex-1 r-scrim-text">
              <p className="r-hero-title">{r("jl.lines", { list: lineList })}</p>
              <p className="r-hero-sub">{active.to.label}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearActiveTrip();
                void navigate({ to: "/trips" });
              }}
              className="r-pill r-pill--glass r-pill--lg shrink-0"
            >
              {t("trip.endTrip")}
            </button>
          </header>
          <div className="absolute bottom-[72px] left-4 right-4 z-[8] flex flex-wrap gap-2">
            <span className="r-pill r-pill--glass r-tnum">
              {r("jl.legOf", { n: rideNo, total: live.totalRides || parts.rides.length })}
            </span>
            <span className="r-pill r-pill--glass r-tnum">
              {itin.transfers === 1 ? r("jl.changes1") : r("jl.changesN", { n: itin.transfers })}
            </span>
            {live.active && live.fusedCurrentVehicle ? (
              <span className="r-pill r-pill--glass">
                <span className="r-dot r-live-pulse" />
                {r("trip.livePos")}
              </span>
            ) : null}
          </div>
        </div>

        <NotchCard
          className="r-hero-sheet"
          radius={34}
          shadow="drop-shadow(0 -8px 24px rgba(0,0,0,.16))"
        >
          <div className="px-5 pt-6" style={{ paddingBottom: "calc(var(--r-safe-bottom) + 48px)" }}>
            <div className="r-phase">
              <PhaseLabel live={live} itin={itin} />
              <PhaseHeadline live={live} itin={itin} />
              <PhaseSub live={live} itin={itin} destLabel={active.to.label} dest={active.to} />
            </div>

            <LiveLegNow live={live} itin={itin} />
            <NextChange live={live} parts={parts} destLabel={active.to.label} />

            <div className="mt-4">
              <MultiLegActions live={live} active={active} onImOff={handleImOff} />
            </div>

            <div className="r-legacy -mx-5">
              {/* Resilience banners */}
              {live.active && live.tripGhost && !live.vehicleLost && (
                <div className="mt-3">
                  <StaleFeedBanner variant="ghost-bus" />
                </div>
              )}
              {live.active && live.vehicleLost && (
                <div className="mt-3">
                  <StaleFeedBanner variant="vehicle-lost" />
                </div>
              )}
              {live.active && !live.vehicleLost && !live.tripGhost && live.feedStale && (
                <div className="mt-3">
                  <StaleFeedBanner variant="feed-stale" />
                </div>
              )}
              {live.active &&
                (live.phase === "walking-to-transfer" ||
                  live.phase === "waiting-for-connection") &&
                live.nextRideLeg &&
                !live.nextVehicleTracked && (
                  <div className="mt-3">
                    <StaleFeedBanner variant="next-not-tracked" />
                  </div>
                )}

              {/* Sighting at the stop; still-on-board ask once riding. */}
              {live.currentRideLeg &&
                shouldOfferSighting({
                  active: live.active,
                  phase: live.phase,
                  tripGhost: live.tripGhost,
                  hasCurrentRide: true,
                  metersToTarget: live.metersToTarget,
                }) && (
                  <div className="mt-3 px-5">
                    <SightingButton
                      tripId={live.currentRideLeg.tripId}
                      routeId={live.currentRideLeg.routeId}
                      stopId={live.currentRideLeg.board.stopId}
                      lat={live.currentRideLeg.board.lat}
                      lng={live.currentRideLeg.board.lng}
                      needEyes={seeds.has(live.currentRideLeg.routeId)}
                    />
                  </div>
                )}
              {live.currentRideLeg &&
                shouldAskStillOnBoard({
                  active: live.active,
                  phase: live.phase,
                  tripGhost: live.tripGhost,
                  vehicleLost: live.vehicleLost,
                  hasCurrentRide: true,
                }) && (
                  <div className="mt-3 px-5">
                    <SightingButton
                      kind="onboard"
                      tripId={live.currentRideLeg.tripId}
                      routeId={live.currentRideLeg.routeId}
                      routeShort={live.currentRideLeg.routeShort}
                      stopId={live.currentRideLeg.board.stopId}
                      lat={live.fusedCurrentVehicle?.lat ?? live.currentRideLeg.board.lat}
                      lng={live.fusedCurrentVehicle?.lng ?? live.currentRideLeg.board.lng}
                      needEyes={seeds.has(live.currentRideLeg.routeId)}
                    />
                  </div>
                )}
              {live.active &&
                (live.phase === "walking-to-transfer" ||
                  live.phase === "waiting-for-connection") &&
                live.nextRideLeg &&
                !live.nextVehicleTracked && (
                  <div className="mt-3 px-5">
                    <SightingButton
                      tripId={live.nextRideLeg.tripId}
                      routeId={live.nextRideLeg.routeId}
                      stopId={live.nextRideLeg.board.stopId}
                      lat={live.nextRideLeg.board.lat}
                      lng={live.nextRideLeg.board.lng}
                      needEyes={seeds.has(live.nextRideLeg.routeId)}
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
                <section className="px-5 mt-3">
                  <div className="r-card px-4 py-3" style={{ background: "#f3f3f0" }}>
                    <p className="r-lbl">{t("ml.boardingAdjusted")}</p>
                    <p className="mt-1 text-[14px]">
                      {t("ml.boardingAdjustedBody", { name: live.rerouteHint.newStopName })}
                    </p>
                  </div>
                </section>
              )}
              {live.active && live.rerouteHint?.kind === "offer-replan" && (
                <section className="px-5 mt-3">
                  <div className="r-card px-4 py-3" style={{ background: "var(--r-y-soft)" }}>
                    <p className="r-lbl">{t("ml.differentStop")}</p>
                    <p className="mt-1 text-[14px]">{live.rerouteHint.reason}</p>
                    <button
                      type="button"
                      onClick={() => setEarlyAlightOpen(true)}
                      className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-[var(--r-char)] px-4 text-[14px] font-semibold text-white"
                    >
                      {t("ml.replanFromHere")}
                    </button>
                  </div>
                </section>
              )}

              {/* Crowd / comfort prediction during ride or wait */}
              {live.active &&
                (live.phase === "riding" ||
                  live.phase === "alight-soon" ||
                  live.phase === "waiting-to-board") &&
                live.currentRideLeg && (
                  <CrowdHint
                    routeId={live.currentRideLeg.routeId}
                    tripId={live.currentRideLeg.tripId}
                    weatherAt={
                      getStop(live.currentRideLeg.alight.stopId)?.agency === "IC"
                        ? {
                            lat: live.currentRideLeg.alight.lat,
                            lng: live.currentRideLeg.alight.lng,
                          }
                        : null
                    }
                  />
                )}

              {/* Skip-ahead prompt when destination is in reach. */}
              {shortcut.shouldPrompt && live.fix && (
                <ShortcutPrompt
                  active={active}
                  fix={{ lat: live.fix.lat, lng: live.fix.lng }}
                  distanceM={shortcut.distanceM}
                  onDismiss={shortcut.dismiss}
                />
              )}

              {/* Turn-by-turn for any walk leg */}
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
                    <section className="mt-3 px-5">
                      <LastMileChainCard suggestion={lastMileChain} />
                    </section>
                  )}
                  <LiveWalkBanner
                    from={{ lat: live.currentLeg.from.lat, lng: live.currentLeg.from.lng }}
                    to={{ lat: live.currentLeg.to.lat, lng: live.currentLeg.to.lng }}
                    fix={live.fix}
                    title={walkBannerTitle}
                  />
                  <WalkGuidance
                    from={{ lat: live.currentLeg.from.lat, lng: live.currentLeg.from.lng }}
                    to={{ lat: live.currentLeg.to.lat, lng: live.currentLeg.to.lng }}
                    title={walkBannerTitle}
                  />
                </>
              )}
            </div>

            {/* Every leg, current one highlighted, stops expandable */}
            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="r-t2">{r("jl.yourJourney")}</h2>
                <span className="r-lbl r-tnum text-right">
                  {r("jl.totalArr", {
                    d: fmtDur(itin.totalDurationSec),
                    t: clock(itin.arrivalUnix),
                  })}
                </span>
              </div>
              <div className="r-card" style={{ padding: "14px 16px 6px" }}>
                <LegsTimeline
                  itinerary={itin}
                  destLabel={active.to.label}
                  activeLegIndex={live.active ? live.currentLegIndex : undefined}
                />
              </div>
              <p className="r-lbl mt-3 r-tnum" style={{ fontSize: 12 }}>
                Trip {tripId.slice(0, 12)}
              </p>
            </section>
          </div>
        </NotchCard>
      </div>

      {/* Early-alight re-route sheet. */}
      {earlyAlightOpen && live.fix && (
        <EarlyAlightSheet
          active={active}
          fix={{ lat: live.fix.lat, lng: live.fix.lng }}
          onClose={() => setEarlyAlightOpen(false)}
        />
      )}

      {/* Live re-plan sheet, opened from the disruption banner. */}
      {liveReplanOpen && live.fix && disruption && (
        <LiveReplanSheet
          active={active}
          fix={{ lat: live.fix.lat, lng: live.fix.lng }}
          kind={disruption.kind}
          onClose={() => setLiveReplanOpen(false)}
        />
      )}
      <ResumeTripPill />
    </div>
  );
}

/** Charcoal card for the leg you are on (or about to board). */
function LiveLegNow({ live, itin }: { live: MultiLegLive; itin: NonNullable<ActiveTrip["itinerary"]> }) {
  const { r } = useRoamI18n();
  const now = Math.floor(Date.now() / 1000);
  const riding = live.phase === "riding" || live.phase === "alight-soon";
  const atChange =
    live.phase === "walking-to-transfer" || live.phase === "waiting-for-connection";
  const firstRide = itin.legs.find((l): l is RideLeg => l.kind === "ride") ?? null;
  const leg: RideLeg | null = riding
    ? live.currentRideLeg
    : atChange
      ? live.nextRideLeg
      : (live.currentRideLeg ?? firstRide);
  if (!leg || live.phase === "walking-to-destination") return null;

  if (riding) {
    const left = stopsLeft(leg, now, live.fusedCurrentVehicle);
    const calls = rideCalls(leg).length - 1;
    const minLeft = Math.max(0, Math.round(live.secsToCurrentAlight / 60));
    return (
      <section className="r-jc r-jl-now">
        <div className="flex flex-wrap items-center gap-2">
          <JLinePill leg={leg} dark size="lg" />
          <span className="text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
            {r("jl.towards", { dest: towards(leg) })}
          </span>
        </div>
        <p className="mt-4 text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
          {left === 1 ? r("jl.getOffNext") : r("jl.getOffIn")}
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          {left != null && left > 1 ? (
            <p className="r-tnum">
              <span className="r-jl-big">{left}</span>
              <span className="ml-2 text-[18px]">{r("jl.stopsUnit")}</span>
            </p>
          ) : left == null ? (
            <p className="r-tnum">
              <span className="r-jl-big">{minLeft}</span>
              <span className="ml-2 text-[18px]">{r("jl.minUnit")}</span>
            </p>
          ) : (
            <span />
          )}
          {left != null ? (
            <span className="r-pill r-tnum" style={{ background: "#3b3b3b", color: "#fff" }}>
              <Icon name="clock" size={15} />
              {r("jl.minShort", { m: minLeft })}
            </span>
          ) : null}
        </div>
        {left != null && calls > 1 ? (
          <div className="r-jl-progress" aria-hidden="true">
            {Array.from({ length: Math.min(calls, 24) }, (_, i) => {
              const done = Math.round(((calls - left) / calls) * Math.min(calls, 24));
              return <span key={i} className={i < done ? "is-on" : ""} />;
            })}
          </div>
        ) : null}
        <p className="mt-3 text-[16px] font-medium leading-snug">
          {r("jl.getOffAt", { name: cleanName(leg.alight.name) })}
        </p>
      </section>
    );
  }

  const secs = atChange
    ? live.secsToNextBoard
    : live.active
      ? live.secsToCurrentBoard
      : leg.board.departureUnix - now;
  const liveTime = atChange && live.nextBoardSource === "live";
  return (
    <section className="r-jc r-jl-now">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <JLinePill leg={leg} dark size="lg" />
        <span className="r-conf" style={{ color: "var(--r-onchar-mute)" }}>
          {liveTime ? <span className="r-dot" /> : <span className="r-ring" />}
          {liveTime ? r("jl.liveTime") : r("jl.ttTime")}
        </span>
      </div>
      <p className="mt-4 text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
        {r("jl.boardIn")}
      </p>
      <p className="mt-1 r-tnum">
        <span className="r-jl-big">{Math.max(0, Math.round(secs / 60))}</span>
        <span className="ml-2 text-[18px]">{r("jl.minUnit")}</span>
        <span className="ml-3 text-[16px]" style={{ color: "var(--r-onchar-mute)" }}>
          {clock(leg.board.departureUnix)}
        </span>
      </p>
      <p className="mt-3 text-[16px] font-medium leading-snug">
        {r("jl.fromStop", { name: cleanName(leg.board.name) })}
      </p>
      <p className="mt-1 text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
        {r("jl.towards", { dest: towards(leg) })}
      </p>
    </section>
  );
}

/** The next change (or the change in progress), or a last-ride note. */
function NextChange({
  live,
  parts,
  destLabel,
}: {
  live: MultiLegLive;
  parts: ReturnType<typeof journeyParts>;
  destLabel: string;
}) {
  const { r } = useRoamI18n();
  if (live.phase === "walking-to-destination") return null;
  const atChange =
    live.phase === "walking-to-transfer" || live.phase === "waiting-for-connection";
  const cur = live.currentRideLeg ?? parts.rides[0] ?? null;
  const ch: ChangeInfo | undefined = atChange
    ? parts.changes.find((c) => c.to.tripId === live.nextRideLeg?.tripId)
    : parts.changes.find((c) => c.from.tripId === cur?.tripId);
  if (!ch) {
    if (!cur || parts.rides.length < 2) return null;
    return (
      <p className="r-jl-next r-lbl" style={{ color: "var(--r-ink2)" }}>
        {r("jl.lastLeg", {
          d: fmtDist(parts.egress.meters),
          name: destLabel,
        })}
      </p>
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const toAlight =
    live.active && (live.phase === "riding" || live.phase === "alight-soon")
      ? live.secsToCurrentAlight
      : ch.from.alight.arrivalUnix - now;
  const m = Math.max(0, Math.round(toAlight / 60));
  const hot = atChange || live.phase === "alight-soon" || (live.active && toAlight < 180);
  const walk = !(ch.sameStop || ch.walkMeters < 25);
  return (
    <section className={`r-jl-next${hot ? " is-hot" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="r-lbl">{r("jl.nextChange")}</p>
        <p className="text-[15px] font-semibold r-tnum">
          {atChange || m === 0 ? r("jl.changeNow") : r("jl.changeIn", { m })}
        </p>
      </div>
      <p className="mt-1.5 text-[20px] font-medium leading-tight">
        {r("jl.changeAt", { name: cleanName(ch.to.board.name) })}
      </p>
      <div className="r-jl-change-facts r-tnum">
        <span className="r-jl-fact" style={{ background: hot ? "#fff" : "#f3f3f0" }}>
          <Icon name={walk ? "person-simple-walk" : "map-pin-simple"} size={15} />
          {walk ? r("jl.walkFact", { d: fmtDist(ch.walkMeters), m: mins(ch.walkSec) }) : r("jl.sameStop")}
        </span>
        <span className="r-jl-fact" style={{ background: hot ? "#fff" : "#f3f3f0" }}>
          <Icon name="clock" size={15} />
          {ch.waitSec >= 60 ? r("jl.waitFact", { m: mins(ch.waitSec) }) : r("jl.noWait")}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <JLinePill leg={ch.to} size="sm" />
        <span className="text-[14px] r-tnum">
          {r("jl.catchLine", { line: ch.to.routeShort, t: clock(ch.to.board.departureUnix) })}
        </span>
      </div>
    </section>
  );
}
