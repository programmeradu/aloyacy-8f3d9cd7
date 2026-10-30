import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { resolveHeroPhase, type SingleLegPhase } from "@aloya/core/single-leg-phase";
import { applyLiveEta, feedBannerVariant } from "@aloya/core/companion-view";
import { destBailForWait } from "@aloya/core/dest-bail";
import { cyClock } from "@aloya/core/cy-time";
import { BOARDING_PAY, boardingPayKind, formatEur, isCyprusNight } from "@aloya/core/boarding-pay";
import { MapPreview } from "@/components/MapPreview";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ResumeTripPill } from "@/components/ResumeTripPill";
import { RoamPage } from "@/components/roam/RoamPage";
import { NotchCard } from "@/components/roam/NotchCard";
import { BackButton } from "@/components/roam/FrostButton";
import { Icon } from "@/components/roam/Icon";
import { useRoamI18n } from "@/lib/roam-i18n";
import { distanceKm, getRoute, getStop } from "@/lib/gtfs";
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
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/trip/$id")({
  head: ({ params }) => {
    const title = `Live trip · Aloya`;
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
  const { r } = useRoamI18n();
  const { view, walkingPhase, directions, live, mapMarkers, userLocation } =
    useSingleLegView(active);

  // ---- Early returns (all hooks above this line) -------------------------

  if (!active && !hydrated) {
    return <div className="roam r-page" />;
  }

  if (!active) {
    return (
      <RoamPage
        title={r("done.yourTrip")}
        left={<BackButton label={r("back")} variant="light" fallback="/trips" />}
        right={<span />}
      >
        <section className="r-card r-card--pad r-rise">
          <h2 className="r-t2">{t("trip.ended.title")}</h2>
          <p className="r-lbl mt-2">{t("trip.ended.body")}</p>
          <Link
            to="/trips"
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--r-char)] px-5 text-[15px] font-semibold text-white"
          >
            {t("trip.planNew")}
            <Icon name="arrow-up-right" size={16} />
          </Link>
        </section>
      </RoamPage>
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
  const destBail = destBailForWait({
    dark: live.tripGhost,
    phase: phase === "waiting" ? "waiting" : phase === "walking" ? "walking" : "other",
    waitMin: minToBoard,
    from: live.fix ?? (walkIn.kind === "walk" ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null),
    to: { lat: active.to.lat, lng: active.to.lng },
    destLabel: active.to.label,
    routeShort: bus.routeShort,
  });

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

  const banner = feedBannerVariant(live);
  const arrived = phase === "arrived" || live.phase === "arrived";
  const ringNow = phase === "alight-soon" || (phase === "on-bus" && minToAlight <= 3);
  const lateMin = Math.round(delaySec / 60);

  if (arrived) {
    return <TripComplete active={active} bus={bus} />;
  }

  return (
    <div className="roam r-page">
      <div className="r-col">
        <OfflineBanner />
        <div className="r-hero-map r-mapwrap" style={{ height: 420 }}>
          <div className="r-map-fill">
            <MapPreview
              bare
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
              attribTop="calc(var(--r-safe-top) + 64px)"
            />
          </div>
          <div className="r-shade-top" style={{ height: 170 }} />
          <div className="r-shade-bottom" style={{ height: 120 }} />
          <header className="r-hero-head">
            <BackButton label={r("back")} fallback="/trips" />
            <div className="min-w-0 flex-1 r-scrim-text">
              <p className="r-hero-title truncate">
                {t("trip.live")} · {bus.routeShort}
              </p>
              <p className="r-hero-sub truncate">{active.to.label}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearActiveTrip();
                navigate({ to: "/trips" });
              }}
              className="r-pill r-pill--glass r-pill--lg"
            >
              {t("trip.endTrip")}
            </button>
          </header>
          <div className="absolute bottom-[72px] left-4 right-4 z-[8] flex flex-wrap gap-2">
            {live.active && (
              <span className="r-pill r-pill--glass">
                <span className="r-dot r-live-pulse" />
                {r("trip.livePos")}
              </span>
            )}
            <span className="r-pill r-pill--glass r-tnum">
              {lateMin > 0 ? r("trip.late", { n: lateMin }) : r("trip.onTime")}
            </span>
          </div>
        </div>

        <NotchCard
          className="r-hero-sheet"
          radius={34}
          shadow="drop-shadow(0 -8px 24px rgba(0,0,0,.16))"
        >
          <div className="px-5 pt-6" style={{ paddingBottom: "calc(var(--r-safe-bottom) + 48px)" }}>
            <div className="r-phase">
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
                destBail={destBail}
                routeId={bus.routeId}
                stopId={bus.board.stopId}
              />
            </div>

            <LegStrip bus={bus} />

            {ringNow && (
              <div className="mt-5 flex flex-col items-center gap-2 text-center">
                <a
                  href="#trip-hud"
                  className="r-fb r-fb--y r-fb--lg r-live-pulse"
                  aria-label={r("trip.ring")}
                >
                  <Icon name="bell-simple-ringing" />
                </a>
                <p className="text-[14px]">{r("trip.ring")}</p>
              </div>
            )}

            <div className="r-legacy -mx-5">
              {/* Watch together: right under the hero so the rider can invite
                  friends before the trip really starts, and so returning to
                  this page later brings them back to their group. */}
              <section className="mt-5 px-5">
                <WatchTogetherButton
                  origin={{ lat: active.from.lat, lng: active.from.lng, label: active.from.label }}
                  destination={{ lat: active.to.lat, lng: active.to.lng, label: active.to.label }}
                />
              </section>

              {banner && (
                <div className="mt-3">
                  <StaleFeedBanner variant={banner} />
                </div>
              )}

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
                  </div>
                </section>
              )}

              {/* Live HUD: Start button, current walking step, hurry banner,
                  on-board prompt (Did it come), missed-bus rescue, alight
                  countdown with Get off, arrived card. */}
              <div className="mt-6 scroll-mt-24" id="trip-hud">
                <JourneyHUD trip={active} live={live} steps={directions?.steps ?? null} />
              </div>

              {walkingPhase === "to-dest" && walkOut.kind === "walk" && (
                <LongFinalWalkHint
                  from={{ lat: walkOut.from.lat, lng: walkOut.from.lng }}
                  to={{ lat: walkOut.to.lat, lng: walkOut.to.lng }}
                  distanceMeters={walkOut.distanceMeters}
                  durationSec={walkOut.durationSec}
                  destinationLabel={active.to.label}
                />
              )}

              {/* Static turn-by-turn: only shown when live tracking is OFF. */}
              {!live.active && directions && directions.steps.length > 0 && (
                <section className="mt-6 px-5">
                  <div className="mb-3 flex items-end justify-between">
                    <h2 className="r-t3">
                      {walkingPhase === "to-stop" ? t("trip.walkToStopH") : t("trip.walkToDestH")}
                    </h2>
                    <span className="r-lbl r-tnum">
                      {Math.round(directions.durationSec / 60)} {t("common.minUnit")} ·{" "}
                      {directions.distanceMeters >= 1000
                        ? `${(directions.distanceMeters / 1000).toFixed(1)} km`
                        : `${Math.round(directions.distanceMeters)} m`}
                    </span>
                  </div>
                  <ol className="space-y-3">
                    {directions.steps.map((st, i) => (
                      <TurnStep
                        key={i}
                        index={i + 1}
                        instruction={st.instruction}
                        distanceMeters={st.distanceMeters}
                        maneuver={st.maneuver}
                        lat={st.start.lat}
                        lng={st.start.lng}
                        heading={st.heading}
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

              {ringNow && (
                <AlightAlert
                  phase={phase}
                  minToAlight={minToAlight}
                  alightName={bus.alight.name}
                  destLabel={active.to.label}
                  walkOutSec={walkOutSec}
                />
              )}
            </div>
          </div>
        </NotchCard>
      </div>
      <ResumeTripPill />
    </div>
  );
}

type BusView = NonNullable<ReturnType<typeof useSingleLegView>["view"]>["bus"];

function clock(unix: number) {
  return cyClock(unix * 1000);
}

/** Board to alight on the yellow dot timeline (charcoal journey card). */
function LegStrip({ bus, dark = false }: { bus: BusView; dark?: boolean }) {
  const mins = Math.max(1, Math.round((bus.alight.arrivalUnix - bus.board.departureUnix) / 60));
  const mute = dark ? "var(--r-onchar-mute)" : "var(--r-mute)";
  return (
    <div className={dark ? "" : "mt-5 rounded-[22px] bg-[#f3f3f0] px-4 py-4"}>
      <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 r-tnum">
        <span className="text-[14px]" style={{ color: mute }}>
          {clock(bus.board.departureUnix)}
        </span>
        <span className="text-center text-[16px] font-medium">{mins} min</span>
        <span className="text-[14px]" style={{ color: mute }}>
          {clock(bus.alight.arrivalUnix)}
        </span>
      </div>
      <div className="r-tl-line mt-2" style={{ height: 30 }} aria-hidden="true">
        <span className="ln" />
        <span className="e" style={{ left: 0 }} />
        <span className="e" style={{ right: 0 }} />
        <span
          className="absolute left-1/2 top-1/2 flex size-[30px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{ background: "var(--r-y)", color: "var(--r-ink)" }}
        >
          <Icon name="bus" size={16} />
        </span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-[14px]">
        <span className="min-w-0 flex-1">{bus.board.name}</span>
        <span className="min-w-0 flex-1 text-right">{bus.alight.name}</span>
      </div>
    </div>
  );
}

/** Trip complete (Roam): charcoal summary with the scoop and check, then the line card. */
function TripComplete({
  active,
  bus,
}: {
  active: NonNullable<ReturnType<typeof useActiveTrip>>;
  bus: BusView;
}) {
  const { t, locale } = useI18n();
  const { r } = useRoamI18n();
  const navigate = useNavigate();
  const route = getRoute(bus.routeId);
  const payKind = boardingPayKind({ agency: route?.agency, short: bus.routeShort });
  const night = isCyprusNight(bus.board.departureUnix * 1000);
  const fare =
    payKind === "urban"
      ? formatEur(
          night ? BOARDING_PAY.urban.night.motionEur : BOARDING_PAY.urban.day.motionEur,
          true,
        )
      : null;
  const board = getStop(bus.board.stopId);
  const alight = getStop(bus.alight.stopId);
  const km = board && alight ? distanceKm(board, alight) : null;
  const date = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Nicosia",
  }).format(new Date(bus.alight.arrivalUnix * 1000));
  const done = () => {
    clearActiveTrip();
    navigate({ to: "/" });
  };
  return (
    <RoamPage
      title={r("done.yourTrip")}
      left={<BackButton label={r("back")} variant="light" fallback="/" />}
      right={<span />}
    >
      <NotchCard
        fill="#262626"
        radius={28}
        shadow="drop-shadow(0 18px 30px rgba(0,0,0,.22))"
        className="r-rise text-white"
        notches={[{ edge: "bottom", cx: 0, center: true, width: 120, depth: 22 }]}
      >
        <div className="px-5 pt-5 pb-9">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="r-t1" style={{ color: "#fff" }}>
                {r("done.title")}
              </h1>
              <p className="r-lbl mt-1.5" style={{ color: "var(--r-onchar-mute)" }}>
                {date} · {route?.short ? `${t("stop.routeKicker")} ${route.short}` : bus.routeShort}
              </p>
            </div>
            <span
              className="flex size-11 items-center justify-center rounded-full"
              style={{ background: "var(--r-y)", color: "var(--r-ink)" }}
              aria-hidden="true"
            >
              <Icon name="check" size={22} />
            </span>
          </div>
          <div className="mt-6">
            <LegStrip bus={bus} dark />
          </div>
          {km != null && km > 0.2 ? (
            <div className="mt-3 flex justify-center">
              <span className="r-dpill r-tnum">≈ {km.toFixed(1)} km</span>
            </div>
          ) : null}
        </div>
      </NotchCard>

      <section className="r-card mt-4 overflow-hidden r-rise" style={{ animationDelay: "80ms" }}>
        <div className="px-5 pt-5">
          <p className="r-t2">
            {t("stop.routeKicker")} {bus.routeShort}
          </p>
          <p className="r-lbl mt-1">{active.to.label}</p>
        </div>
        <div className="flex justify-center py-2">
          <img
            src="/roam/bus-front.webp"
            alt=""
            width={220}
            height={190}
            loading="lazy"
            style={{ objectFit: "contain" }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pb-5">
          <p className="r-lbl">{t("hud.arrived.title", { name: active.to.label })}</p>
          {fare ? (
            <span className="r-pill r-pill--y r-tnum">
              <Icon name="credit-card" />
              {r("done.fare", { fare })}
            </span>
          ) : null}
        </div>
      </section>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={done}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--r-char)] text-[15px] font-semibold text-white"
        >
          {t("hud.arrived.done")}
        </button>
        <Link
          to="/trips"
          onClick={() => clearActiveTrip()}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-white text-[15px] font-semibold"
        >
          {t("trip.planNew")}
        </Link>
      </div>
    </RoamPage>
  );
}
