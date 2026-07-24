import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deriveSchedulePhase,
  resolveHeroPhase,
  walkingPhaseFor,
  type SingleLegPhase,
} from "@aloya/core/single-leg-phase";
import { applyLiveEta, buildCompanionMarkers, feedBannerVariant } from "@aloya/core/companion-view";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { IconArrowLeft } from "@/components/Icons";
import { TurnStep } from "@/components/WalkGuidance";
import { LongFinalWalkHint } from "@/components/LongFinalWalkHint";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { useRealtime } from "@/lib/useRealtime";
import { useActiveTrip, clearActiveTrip, isMultiLeg } from "@/lib/trip-store";
import { MultiLegCompanion } from "@/components/MultiLegCompanion";
import { getWalkingDirections } from "@/lib/maps.functions";
import { useJourney } from "@/lib/useJourney";
import { useCompass } from "@/lib/useCompass";
import { distanceM as haversineMeters, bearingDeg } from "@/lib/geo";
import { JourneyHUD } from "@/components/JourneyHUD";
import { WatchTogetherButton } from "@/components/WatchTogetherButton";
import { useTick } from "@/hooks/use-tick";
import { PhaseHeadline, PhaseLabel, PhaseSub } from "@/components/trip/PhaseHero";
import { AlightAlert, JourneyTimeline } from "@/components/trip/JourneyTimeline";
import companionHero from "@/assets/companion-hero.jpg";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/trip/$id")({
  head: ({ params }) => {
    const title = `Live trip — Aloya`;
    const desc = `Door-to-door live guidance for trip ${params.id}.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `https://app.aloya.cy/trip/${params.id}` },
        { property: "og:image", content: "https://app.aloya.cy/og/og-trip-live.jpg" },
        { property: "og:image:width", content: "1216" },
        { property: "og:image:height", content: "640" },
        { name: "twitter:image", content: "https://app.aloya.cy/og/og-trip-live.jpg" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: `https://app.aloya.cy/trip/${params.id}` }],
    };
  },
  component: TripCompanion,
});

function TripCompanion() {
  const active = useActiveTrip();
  // Wait for localStorage hydration before deciding the trip is "gone".
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Multi-leg itineraries (≥ 2 ride legs) get the leg-aware companion.
  if (active && isMultiLeg(active.itinerary)) {
    return <MultiLegCompanion active={active} />;
  }
  return <SingleLegCompanion active={active} hydrated={hydrated} />;
}

function SingleLegCompanion({
  active,
  hydrated,
}: {
  active: ReturnType<typeof useActiveTrip>;
  hydrated: boolean;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: rt } = useRealtime();
  const tick = useTick(5_000);

  const fetchDirections = useServerFn(getWalkingDirections);

  const view = useMemo(() => {
    if (!active) return null;
    const now = Math.floor(Date.now() / 1000);
    const bus = active.option.legs.find((l) => l.kind === "bus");
    const walkIn = active.option.legs[0];
    const walkOut = active.option.legs[active.option.legs.length - 1];
    if (!bus || bus.kind !== "bus") return null;
    if (walkIn.kind !== "walk" || walkOut.kind !== "walk") return null;

    // Live re-read of this trip from the realtime feed.
    const liveBoard = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.board.stopId,
    );
    const liveAlight = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.alight.stopId,
    );

    const schedule = deriveSchedulePhase({
      nowUnix: now,
      boardUnix: liveBoard?.arrivalUnix ?? bus.board.departureUnix,
      alightUnix: liveAlight?.arrivalUnix ?? bus.alight.arrivalUnix,
      walkInSec: walkIn.durationSec,
      walkOutSec: walkOut.durationSec,
      // Anchor the walking window to when the rider pressed "Start", not to
      // the schedule: RAPTOR returns the soonest option, so the board time is
      // often already a minute in the past by the time they pick it.
      startedAtUnix: active.live?.startedAt ? Math.floor(active.live.startedAt / 1000) : null,
      onBoard: !!active.live?.onBoardConfirmedAt,
      alighted: !!active.live?.alightedAt,
    });

    return {
      bus,
      walkIn,
      walkOut,
      delaySec: liveBoard?.delaySec ?? bus.delaySec,
      ...schedule,
    };
    // `tick` is a deliberate heartbeat that forces countdown recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rt, tick]);

  // Computed defensively so hook order stays stable when the active trip is
  // cleared (e.g. the rider taps "End").
  const walkingPhase = view ? walkingPhaseFor(view.phase, !!active?.live?.alightedAt) : null;
  const walkLeg = view
    ? walkingPhase === "to-stop"
      ? view.walkIn
      : walkingPhase === "to-dest"
        ? view.walkOut
        : null
    : null;
  const walkFrom = walkLeg && walkLeg.kind === "walk" ? walkLeg.from : null;
  const walkTo = walkLeg && walkLeg.kind === "walk" ? walkLeg.to : null;

  const { data: dir } = useQuery({
    queryKey: ["walk", walkFrom?.lat, walkFrom?.lng, walkTo?.lat, walkTo?.lng],
    enabled: !!walkFrom && !!walkTo,
    queryFn: () => fetchDirections({ data: { from: walkFrom!, to: walkTo! } }),
    staleTime: 10 * 60 * 1000,
  });
  const directions = walkingPhase ? (dir?.directions ?? null) : null;

  const live = useJourney({
    active,
    walkingSteps: directions?.steps ?? null,
    walkingPhase,
  });

  // Compass heading (works while stationary). GPS heading is only valid
  // while moving > ~2 m/s. As a third fallback we derive a bearing from
  // two recent fixes > 5 m apart — covers desktop dev and indoor pre-walk
  // scenarios where neither sensor is reporting.
  const compass = useCompass(live.active);
  const prevFixRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const derivedHeadingRef = useRef<number | null>(null);
  if (live.fix) {
    const prev = prevFixRef.current;
    if (!prev) {
      prevFixRef.current = { lat: live.fix.lat, lng: live.fix.lng, t: live.fix.timestamp };
    } else if (live.fix.timestamp !== prev.t) {
      if (haversineMeters(prev, live.fix) > 5) {
        derivedHeadingRef.current = bearingDeg(prev, live.fix);
        prevFixRef.current = { lat: live.fix.lat, lng: live.fix.lng, t: live.fix.timestamp };
      }
    }
  }

  const mapMarkers: MapMarker[] = useMemo(() => {
    if (!view || !active) return [];
    const { bus, walkIn, walkOut } = view;
    return buildCompanionMarkers({
      walkingPhase,
      walkIn: walkIn.kind === "walk" ? { from: walkIn.from, to: walkIn.to } : null,
      walkOut: walkOut.kind === "walk" ? { from: walkOut.from, to: walkOut.to } : null,
      originLabel: active.from.label,
      destLabel: active.to.label,
      boardName: bus.board.name,
      alightName: bus.alight.name,
    });
  }, [walkingPhase, active, view]);

  // ---- Early returns (all hooks above this line) -------------------------

  if (!active && !hydrated) {
    return (
      <AppShell>
        <div className="px-6 pt-10" />
      </AppShell>
    );
  }

  if (!active) {
    return (
      <AppShell>
        <div className="px-6 pt-2 pb-4 animate-rise">
          <Link
            to="/trips"
            className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
          >
            <IconArrowLeft className="size-4" />
          </Link>
        </div>
        <section className="px-6 mt-6 animate-rise">
          <h1 className="font-display text-[36px] leading-tight text-ink">
            {t("trip.ended.title")}
          </h1>
          <p className="mt-3 text-[13px] text-ink-soft">{t("trip.ended.body")}</p>
          <Link
            to="/trips"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            {t("trip.planNew")}
          </Link>
        </section>
      </AppShell>
    );
  }

  if (!view) return null;
  const { bus, walkIn, walkOut, delaySec, minToLeave } = view;
  const walkInSec = walkIn.kind === "walk" ? walkIn.durationSec : 0;
  const walkOutSec = walkOut.kind === "walk" ? walkOut.durationSec : 0;

  // GPS truth wins over the schedule once tracking is on, so the hero card
  // can't contradict the HUD ("AT THE STOP" while the HUD shouts "HURRY").
  const phase: SingleLegPhase = resolveHeroPhase(view.phase, live);
  const { minToBoard, minToAlight, minToDoor } = applyLiveEta(
    { minToBoard: view.minToBoard, minToAlight: view.minToAlight, minToDoor: view.minToDoor },
    { phase, walkOutSec, live },
  );

  const vehicleOverrides = live.fusedVehicle
    ? {
        [live.fusedVehicle.tripId]: {
          ...live.fusedVehicle,
          routeId: bus.routeId,
          label: `Bus ${bus.routeShort}`,
          source: (live.vehicleLost ? "synthetic" : "feed+rider") as "synthetic" | "feed+rider",
        },
      }
    : undefined;

  const userLocation = live.fix
    ? {
        lat: live.fix.lat,
        lng: live.fix.lng,
        accuracyM: live.fix.accuracyM,
        headingDeg:
          compass.headingDeg != null
            ? compass.headingDeg
            : live.fix.headingDeg != null
              ? live.fix.headingDeg
              : derivedHeadingRef.current,
      }
    : null;

  const banner = feedBannerVariant(live);

  return (
    <AppShell>
      <div className="px-6 pt-2 pb-4 flex items-center justify-between animate-rise">
        <Link
          to="/trips"
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("trip.live")}
        </span>
        <button
          onClick={() => {
            clearActiveTrip();
            navigate({ to: "/trips" });
          }}
          className="rounded-full bg-ink px-4 py-2 font-sans text-[12px] font-semibold tracking-tight text-limestone shadow-sm hover:bg-ink/90 active:scale-[0.98] transition"
        >
          {t("trip.endTrip")}
        </button>
      </div>

      {/* Hero phase card */}
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
            <PhaseLabel phase={phase} delaySec={delaySec} />
            <PhaseHeadline
              phase={phase}
              minToLeave={minToLeave}
              minToBoard={minToBoard}
              minToAlight={minToAlight}
              minToDoor={minToDoor}
              boardName={bus.board.name}
              alightName={bus.alight.name}
            />
            <PhaseSub
              phase={phase}
              walkInSec={walkInSec}
              walkOutSec={walkOutSec}
              destName={active.to.label}
              boardName={bus.board.name}
              alightName={bus.alight.name}
              minToDoor={minToDoor}
            />
          </div>
        </article>
      </section>

      {/* Watch together — prominent right under the hero so the rider can
          invite friends before the trip really starts, and so returning to
          this page later brings them back to their group. */}
      <section className="mt-4 px-6 animate-rise" style={{ animationDelay: "90ms" }}>
        <WatchTogetherButton
          origin={{ lat: active.from.lat, lng: active.from.lng, label: active.from.label }}
          destination={{ lat: active.to.lat, lng: active.to.lng, label: active.to.label }}
        />
      </section>

      {/* Live map */}
      <section className="mt-5 px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MapPreview
          height="h-56"
          center={{
            lat: (active.from.lat + active.to.lat) / 2,
            lng: (active.from.lng + active.to.lng) / 2,
          }}
          spanKm={1.5}
          polyline={directions?.polyline}
          markers={mapMarkers}
          liveVehicles
          focusTripId={bus.tripId}
          focusRouteId={bus.routeId}
          vehicleOverrides={vehicleOverrides}
          liveLabel={
            live.active && live.vehicleLost
              ? {
                  active: "Tracking your bus from your phone",
                  empty: "Using your phone as the bus",
                }
              : undefined
          }
          userLocation={userLocation}
        />
      </section>

      {/* Honest feed/vehicle banner */}
      {banner && (
        <div className="mt-3">
          <StaleFeedBanner variant={banner} />
        </div>
      )}

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
            <p className="mt-1 text-[13px] text-ink">{live.rerouteHint.reason}</p>
          </div>
        </section>
      )}

      {/* Live HUD: Start button, current walking step, hurry banner,
          on-board prompt, missed-bus rescue, alight & arrived cards. */}
      <div className="mt-6">
        <JourneyHUD trip={active} live={live} steps={directions?.steps ?? null} />
      </div>

      {/* Long final walk hint — shown whenever the rider is on the egress
          walk (live or static) and the distance is too long to be a pleasant
          stroll. Sits above the turn-by-turn so the rider sees the choice
          before scrolling through a dozen steps. */}
      {walkingPhase === "to-dest" && walkOut.kind === "walk" && (
        <LongFinalWalkHint
          from={{ lat: walkOut.from.lat, lng: walkOut.from.lng }}
          to={{ lat: walkOut.to.lat, lng: walkOut.to.lng }}
          distanceMeters={walkOut.distanceMeters}
          durationSec={walkOut.durationSec}
          destinationLabel={active.to.label}
        />
      )}

      {/* Static turn-by-turn — only shown when live tracking is OFF. */}
      {!live.active && directions && directions.steps.length > 0 && (
        <section className="mt-6 px-6 animate-rise" style={{ animationDelay: "150ms" }}>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-2xl text-ink">
              {walkingPhase === "to-stop" ? t("trip.walkToStopH") : t("trip.walkToDestH")}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {Math.round(directions.durationSec / 60)} {t("common.minUnit")} —{" "}
              {directions.distanceMeters >= 1000
                ? `${(directions.distanceMeters / 1000).toFixed(1)} km`
                : `${Math.round(directions.distanceMeters)} m`}
            </span>
          </div>
          <ol className="space-y-3">
            {directions.steps.map((s, i) => (
              <TurnStep
                key={i}
                index={i + 1}
                instruction={s.instruction}
                distanceMeters={s.distanceMeters}
                maneuver={s.maneuver}
                lat={s.start.lat}
                lng={s.start.lng}
                heading={s.heading}
                last={i === directions.steps.length - 1}
              />
            ))}
          </ol>
        </section>
      )}

      <JourneyTimeline
        phase={phase}
        bus={bus}
        walkIn={walkIn}
        walkOut={walkOut}
        destLabel={active.to.label}
        totalDurationSec={active.option.totalDurationSec}
      />

      {(phase === "alight-soon" || (phase === "on-bus" && minToAlight <= 3)) && (
        <AlightAlert
          phase={phase}
          minToAlight={minToAlight}
          alightName={bus.alight.name}
          destLabel={active.to.label}
          walkOutSec={walkOutSec}
        />
      )}
    </AppShell>
  );
}
