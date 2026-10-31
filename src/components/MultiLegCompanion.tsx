// Multi-leg trip companion. Renders the full N-leg journey with leg-aware
// status card, dual-vehicle map indicator (current + connecting bus), and
// per-leg action buttons. Used in place of the single-leg `TripCompanion`
// when `active.itinerary` has ≥ 2 ride legs.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MapPreview } from "@/components/MapPreview";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { IconArrowLeft } from "@/components/Icons";
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
import { fmtClock as fmtTime } from "@/lib/journey-copy";
import { boundsForItinerary } from "@aloya/core/itinerary-bounds";
import { shouldAskStillOnBoard, shouldOfferSighting } from "@aloya/core/multileg-banners";
import { useSparseSeedIds } from "@/lib/useSparseSeeds";
import { useI18n } from "@/lib/i18n";
import { PhaseLabel, PhaseHeadline, PhaseSub } from "@/components/multileg/PhaseCopy";
import { MultiLegActions } from "@/components/multileg/MultiLegActions";
import { LegTimelineRow } from "@/components/multileg/LegTimelineRow";
import companionHero from "@/assets/companion-hero.jpg";
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
  const mapMarkers = useMemo(() => buildMultiLegMapMarkers(active, itin), [active, itin]);

  const walkBannerTitle = live.currentLeg
    ? getWalkBannerTitle(live.phase, live.nextRideLeg?.routeShort, t)
    : "";

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
        <span className="text-[12px] text-ink-soft">
          {t("ml.rideOfN", {
            label:
              itin.transfers === 1 ? t("ml.changesOne") : t("ml.changesN", { n: itin.transfers }),
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
            <PhaseSub live={live} itin={itin} destLabel={active.to.label} dest={active.to} />
          </div>
        </article>
      </section>

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
        (live.phase === "walking-to-transfer" || live.phase === "waiting-for-connection") &&
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
          <div className="mt-3 px-6">
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
          <div className="mt-3 px-6">
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
        <section className="px-6 mt-3 animate-rise">
          <div className="rounded-[22px] bg-aegean-soft/50 ring-1 ring-aegean/30 px-4 py-3">
            <p className="text-[12px] text-aegean-deep">
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
            <p className="text-[12px] text-ochre">
              {t("ml.differentStop")}
            </p>
            <p className="mt-1 text-[13px] text-ink">{live.rerouteHint.reason}</p>
            <button
              onClick={() => setEarlyAlightOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12px] text-limestone"
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
              ? {
                  lat: live.fix.lat,
                  lng: live.fix.lng,
                  accuracyM: live.fix.accuracyM,
                  headingDeg: live.fix.headingDeg,
                }
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
            <section className="mt-3 px-6 animate-rise">
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

      {/* Timeline of every leg with current highlighted */}
      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">{t("trip.yourJourney")}</h2>
          <span className="font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
            {t("ml.minArr", {
              m: Math.round(itin.totalDurationSec / 60),
              t: fmtTime(itin.arrivalUnix),
            })}
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
