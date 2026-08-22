import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { resolveHeroPhase, type SingleLegPhase } from "@aloya/core/single-leg-phase";
import { applyLiveEta, feedBannerVariant } from "@aloya/core/companion-view";
import { AppShell } from "@/components/AppShell";
import { MapPreview } from "@/components/MapPreview";
import { IconArrowLeft } from "@/components/Icons";
import { TurnStep } from "@/components/WalkGuidance";
import { LongFinalWalkHint } from "@/components/LongFinalWalkHint";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { useActiveTrip, clearActiveTrip, isMultiLeg } from "@/lib/trip-store";
import { MultiLegCompanion } from "@/components/MultiLegCompanion";
import { useSingleLegView } from "@/lib/useSingleLegView";
import { JourneyHUD } from "@/components/JourneyHUD";
import { WatchTogetherButton } from "@/components/WatchTogetherButton";
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
  const { view, walkingPhase, directions, live, mapMarkers, userLocation } =
    useSingleLegView(active);

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
