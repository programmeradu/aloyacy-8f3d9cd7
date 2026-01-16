import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowLeft, IconBus, IconClock, IconPin } from "@/components/Icons";
import { StreetViewSheet } from "@/components/StreetViewSheet";
import { TurnStep } from "@/components/WalkGuidance";
import { LongFinalWalkHint } from "@/components/LongFinalWalkHint";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { useRealtime } from "@/lib/useRealtime";
import { useActiveTrip, clearActiveTrip, isMultiLeg } from "@/lib/trip-store";
import { MultiLegCompanion } from "@/components/MultiLegCompanion";
import { routeTone } from "@/lib/gtfs";
import { getWalkingDirections } from "@/lib/maps.functions";
import { useJourney } from "@/lib/useJourney";
import { useCompass } from "@/lib/useCompass";
import { distanceM as haversineMeters, bearingDeg } from "@/lib/geo";
import { JourneyHUD } from "@/components/JourneyHUD";
import { useTick } from "@/hooks/use-tick";
import companionHero from "@/assets/companion-hero.jpg";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/trip/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Live trip — Aloya` },
      {
        name: "description",
        content: `Door-to-door live guidance for trip ${params.id}.`,
      },
    ],
  }),
  component: TripCompanion,
});

type Phase =
  | "leave-soon"
  | "walking"
  | "waiting"
  | "on-bus"
  | "alight-soon"
  | "arrived";

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

    // Live re-read this trip from realtime feed.
    const liveBoard = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.board.stopId,
    );
    const liveAlight = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.alight.stopId,
    );
    const boardUnix = liveBoard?.arrivalUnix ?? bus.board.departureUnix;
    const alightUnix = liveAlight?.arrivalUnix ?? bus.alight.arrivalUnix;
    const delaySec = liveBoard?.delaySec ?? bus.delaySec;

    const leaveByUnix = boardUnix - walkIn.durationSec;
    const minToLeave = Math.round((leaveByUnix - now) / 60);
    const minToBoard = Math.round((boardUnix - now) / 60);
    const minToAlight = Math.round((alightUnix - now) / 60);
    const minToDoor = Math.round(
      (alightUnix + walkOut.durationSec - now) / 60,
    );

    // Anchor the walking window to when the user actually pressed "Start",
    // not to the schedule. Otherwise a trip whose board time has already
    // passed (common — RAPTOR returns the soonest option, and a minute
    // ticks by while the user picks it) skips straight to "on bus".
    const startedAt = active?.live?.startedAt
      ? Math.floor(active.live.startedAt / 1000)
      : null;
    const walkInSec = walkIn.durationSec;
    const onBoardConfirmed = !!active?.live?.onBoardConfirmedAt;
    const alighted = !!active?.live?.alightedAt;

    let phase: Phase = "leave-soon";
    if (alighted) {
      if (minToDoor > 0) phase = "alight-soon";
      else phase = "arrived";
    } else if (onBoardConfirmed) {
      if (minToAlight > 2) phase = "on-bus";
      else if (minToAlight > -1) phase = "alight-soon";
      else phase = "arrived";
    } else if (startedAt != null) {
      // Live trip: walk first, then wait at stop until rider confirms board.
      const secsSinceStart = now - startedAt;
      if (secsSinceStart < walkInSec - 30) phase = "walking";
      else phase = "waiting";
    } else {
      // Pre-start preview based purely on schedule.
      if (minToLeave > 1) phase = "leave-soon";
      else if (minToBoard > 1) phase = "walking";
      else if (now < boardUnix) phase = "waiting";
      else if (minToAlight > 2) phase = "on-bus";
      else if (minToAlight > -1) phase = "alight-soon";
      else phase = "arrived";
    }

    return {
      bus,
      walkIn,
      walkOut,
      delaySec,
      leaveByUnix,
      boardUnix,
      alightUnix,
      minToLeave,
      minToBoard,
      minToAlight,
      minToDoor,
      phase,
    };
  }, [active, rt, tick]);

  // Compute walking phase/leg defensively so hook order stays stable when
  // the active trip is cleared (e.g. user taps "End").
  const alightedAt = active?.live?.alightedAt ?? null;
  const walkingPhase: "to-stop" | "to-dest" | null = view
    ? alightedAt
      ? "to-dest"
      : view.phase === "leave-soon" || view.phase === "walking" || view.phase === "waiting"
        ? "to-stop"
        : view.phase === "arrived" || view.phase === "alight-soon"
          ? "to-dest"
          : null
    : null;
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
    queryFn: () =>
      fetchDirections({
        data: { from: walkFrom!, to: walkTo! },
      }),
    staleTime: 10 * 60 * 1000,
  });
  const directions = walkingPhase ? dir?.directions ?? null : null;

  const live = useJourney({
    active,
    walkingSteps: directions?.steps ?? null,
    walkingPhase,
  });

  // Compass heading (works while stationary). GPS heading is only valid
  // while moving > ~2 m/s. As a third fallback we derive a bearing from
  // two recent fixes >5 m apart — covers desktop dev and indoor pre-walk
  // scenarios where neither sensor is reporting.
  const compass = useCompass(live.active);
  const prevFixRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const derivedHeadingRef = useRef<number | null>(null);
  if (live.fix) {
    const prev = prevFixRef.current;
    if (!prev) {
      prevFixRef.current = { lat: live.fix.lat, lng: live.fix.lng, t: live.fix.timestamp };
    } else if (live.fix.timestamp !== prev.t) {
      const dM = haversineMeters(prev, live.fix);
      if (dM > 5) {
        derivedHeadingRef.current = bearingDeg(prev, live.fix);
        prevFixRef.current = { lat: live.fix.lat, lng: live.fix.lng, t: live.fix.timestamp };
      }
    }
  }

  const mapMarkers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    if (!view || !active) return out;
    const { bus, walkIn, walkOut } = view;
    if (walkingPhase === "to-stop" && walkIn.kind === "walk") {
      out.push({ lat: walkIn.from.lat, lng: walkIn.from.lng, kind: "origin", label: active.from.label });
      out.push({ lat: walkIn.to.lat, lng: walkIn.to.lng, kind: "stop", label: bus.board.name });
    } else if (walkingPhase === "to-dest" && walkOut.kind === "walk") {
      out.push({ lat: walkOut.from.lat, lng: walkOut.from.lng, kind: "stop", label: bus.alight.name });
      out.push({ lat: walkOut.to.lat, lng: walkOut.to.lng, kind: "destination", label: active.to.label });
    } else {
      if (walkIn.kind === "walk")
        out.push({ lat: walkIn.to.lat, lng: walkIn.to.lng, kind: "stop", label: bus.board.name });
      if (walkOut.kind === "walk")
        out.push({ lat: walkOut.from.lat, lng: walkOut.from.lng, kind: "destination", label: bus.alight.name });
    }
    return out;
  }, [walkingPhase, active, view]);

  // ---- Early returns (all hooks above this line) -------------------------

  if (!active && !hydrated) {
    return <AppShell><div className="px-6 pt-10" /></AppShell>;
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
            Trip ended
          </h1>
          <p className="mt-3 text-[13px] text-ink-soft">
            You're back to the planner. Pick a starting point and a
            destination to begin a new journey — we'll guide you door-to-door
            with live countdowns and a gentle nudge when it's time to step off.
          </p>
          <Link
            to="/trips"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            Plan a new trip
          </Link>
        </section>
      </AppShell>
    );
  }

  if (!view) return null;
  const { bus, walkIn, walkOut, delaySec, phase: schedulePhase, minToLeave } = view;
  let { minToAlight, minToDoor, minToBoard } = view;

  // GPS-truth phase overrides the schedule-based one once live tracking is on,
  // so the hero card stops contradicting the HUD ("AT THE STOP" while the
  // HUD shouts "HURRY — 4 min on foot").
  const liveToHero: Record<string, Phase> = {
    "walking-to-stop": "walking",
    "hurry-soft": "walking",
    "hurry-urgent": "walking",
    "at-stop": "waiting",
    "boarding": "waiting",
    "missed-bus": "walking",
    "on-bus": "on-bus",
    "alight-soon": "alight-soon",
    "walking-to-dest": "arrived",
    "arrived": "arrived",
  };
  const phase: Phase =
    live.active && live.phase !== "idle"
      ? liveToHero[live.phase] ?? schedulePhase
      : schedulePhase;

  // Prefer the GPS-driven secsToBoard so the hero countdown matches the HUD.
  if (live.active && live.secsToBoard > 0 && (phase === "walking" || phase === "waiting")) {
    minToBoard = Math.max(0, Math.round(live.secsToBoard / 60));
  }

  // Override schedule-based ETAs with GPS-fused estimate once on board.
  if (live.active && live.fusedSecsToAlight > 0 && (phase === "on-bus" || phase === "alight-soon")) {
    minToAlight = Math.round(live.fusedSecsToAlight / 60);
    const walkOutSec = walkOut.kind === "walk" ? walkOut.durationSec : 0;
    minToDoor = Math.round((live.fusedSecsToAlight + walkOutSec) / 60);
  }

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
          Live companion
        </span>
        <button
          onClick={() => {
            clearActiveTrip();
            navigate({ to: "/trips" });
          }}
          className="rounded-full bg-ink px-4 py-2 font-sans text-[12px] font-semibold tracking-tight text-limestone shadow-sm hover:bg-ink/90 active:scale-[0.98] transition"
        >
          End trip
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
              walkInSec={walkIn.kind === "walk" ? walkIn.durationSec : 0}
              walkOutSec={walkOut.kind === "walk" ? walkOut.durationSec : 0}
              destName={active.to.label}
              boardName={bus.board.name}
              alightName={bus.alight.name}
              minToDoor={minToDoor}
            />
          </div>
        </article>
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

      {/* Honest feed/vehicle/reroute banners */}
      {live.active && live.feedStale && (
        <div className="mt-3"><StaleFeedBanner variant="feed-stale" /></div>
      )}
      {live.active && !live.feedStale && live.vehicleLost && (
        <div className="mt-3"><StaleFeedBanner variant="vehicle-lost" /></div>
      )}
      {live.active && !live.feedStale && !live.vehicleLost && live.vehicleNotTracked && (
        <div className="mt-3"><StaleFeedBanner variant="next-not-tracked" /></div>
      )}
      {live.active && live.rerouteHint?.kind === "switch-boarding" && (
        <section className="px-6 mt-3 animate-rise">
          <div className="rounded-[22px] bg-aegean-soft/50 ring-1 ring-aegean/30 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
              Boarding adjusted
            </p>
            <p className="mt-1 text-[13px] text-ink">
              You're closer to {live.rerouteHint.newStopName}. Same bus stops here — board from this stop instead.
            </p>
          </div>
        </section>
      )}
      {live.active && live.rerouteHint?.kind === "offer-replan" && (
        <section className="px-6 mt-3 animate-rise">
          <div className="rounded-[22px] bg-ochre-soft/60 ring-1 ring-ochre/30 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
              Different stop
            </p>
            <p className="mt-1 text-[13px] text-ink">
              {live.rerouteHint.reason}
            </p>
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
          before scrolling through 12 steps. */}
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
        <section
          className="mt-6 px-6 animate-rise"
          style={{ animationDelay: "150ms" }}
        >
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-2xl text-ink">
              {walkingPhase === "to-stop" ? "Walk to the stop" : "Walk to destination"}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {Math.round(directions.durationSec / 60)} min —{" "}
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

      {/* Timeline */}
      <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">Your journey</h2>
          <span className="font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
            {Math.round(active.option.totalDurationSec / 60)} min total
          </span>
        </div>

        <ol className="relative rounded-[28px] bg-card ring-1 ring-line p-5 space-y-5">
          <TimelineRow
            active={phase === "leave-soon" || phase === "walking"}
            done={phase !== "leave-soon" && phase !== "walking"}
            title={`Walk to ${bus.board.name}`}
            sub={`${Math.round((walkIn.kind === "walk" ? walkIn.durationSec : 0) / 60)} min — ${Math.round((walkIn.kind === "walk" ? walkIn.distanceMeters : 0))} m`}
          >
            <IconPin className="size-3.5" />
          </TimelineRow>

          <TimelineRow
            active={phase === "waiting" || phase === "on-bus" || phase === "alight-soon"}
            done={phase === "arrived"}
            title={
              <>
                Board <span className="text-aegean-deep">BUS {bus.routeShort}</span> — {bus.routeLong}
              </>
            }
            sub={`Alight at ${bus.alight.name}`}
            accent={<RouteChip code={bus.routeShort} tone={routeTone(bus.routeId)} size="sm" />}
          >
            <IconBus className="size-3.5" />
          </TimelineRow>

          <TimelineRow
            active={phase === "alight-soon" || phase === "arrived"}
            done={false}
            title={`Walk to ${active.to.label}`}
            sub={`${Math.round((walkOut.kind === "walk" ? walkOut.durationSec : 0) / 60)} min — ${Math.round((walkOut.kind === "walk" ? walkOut.distanceMeters : 0))} m`}
          >
            <IconPin className="size-3.5" />
          </TimelineRow>
        </ol>
      </section>

      {/* Alight alert — surfaces a couple of minutes before the stop so the
          rider has time to reach the bell. Pulses once it's truly imminent. */}
      {(phase === "alight-soon" || (phase === "on-bus" && minToAlight <= 3)) && (
        <section className="mt-5 px-6 animate-rise">
          <div
            className={`rounded-[28px] p-5 ring-1 transition-colors ${
              phase === "alight-soon"
                ? "bg-ochre-soft ring-ochre/40"
                : "bg-ochre-soft/60 ring-ochre/25"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
                {phase === "alight-soon" ? "Press the stop button now" : `Get ready — ${Math.max(0, minToAlight)} min`}
              </p>
              {phase === "alight-soon" && (
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-ochre opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-ochre" />
                </span>
              )}
            </div>
            <p className="mt-1 font-display text-[26px] leading-tight text-ink">
              {bus.alight.name}
            </p>
            <p className="mt-1 text-[13px] text-ink-soft">
              {phase === "alight-soon"
                ? `Pull the cord, head to the doors. We'll guide you turn-by-turn to ${active.to.label} once you're off.`
                : `Move toward the doors and find the stop button. ${Math.round((walkOut.kind === "walk" ? walkOut.durationSec : 0) / 60)} min walk waits on the other side.`}
            </p>
          </div>
        </section>
      )}
    </AppShell>
  );
}

function PhaseLabel({ phase, delaySec }: { phase: Phase; delaySec: number }) {
  const tone =
    phase === "arrived"
      ? "text-olive"
      : phase === "alight-soon"
      ? "text-ochre"
      : "text-aegean-deep";
  const txt =
    phase === "leave-soon"
      ? "Get ready"
      : phase === "walking"
      ? "On your way"
      : phase === "waiting"
      ? "At the stop"
      : phase === "on-bus"
      ? "On board"
      : phase === "alight-soon"
      ? "Almost there"
      : "Arrived";
  const delay =
    delaySec > 60
      ? `${Math.round(delaySec / 60)} min late`
      : delaySec < -60
      ? `${Math.round(-delaySec / 60)} min early`
      : "Right on time";
  return (
    <p className={`font-sans text-[12px] font-semibold tracking-tight ${tone}`}>
      {txt} <span className="text-ink-soft/80 font-medium tabular-nums">— {delay}</span>
    </p>
  );
}

function PhaseHeadline({
  phase,
  minToLeave,
  minToBoard,
  minToAlight,
  minToDoor,
  boardName,
  alightName,
}: {
  phase: Phase;
  minToLeave: number;
  minToBoard: number;
  minToAlight: number;
  minToDoor: number;
  boardName: string;
  alightName: string;
}) {
  const base = "mt-2 font-display text-[40px] leading-[1.04] text-ink text-balance";
  if (phase === "leave-soon") {
    return (
      <h1 className={base}>
        Leave in <span className="text-aegean-deep">{Math.max(0, minToLeave)}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
        <br />
        <span className="italic text-olive-soft">walk to {boardName}.</span>
      </h1>
    );
  }
  if (phase === "walking") {
    return (
      <h1 className={base}>
        Bus in <span className="text-aegean-deep">{Math.max(0, minToBoard)}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
        <br />
        <span className="italic text-olive-soft">keep heading to {boardName}.</span>
      </h1>
    );
  }
  if (phase === "waiting") {
    return (
      <h1 className={base}>
        Boards in <span className="text-aegean-deep">{Math.max(0, minToBoard)}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
        <br />
        <span className="italic text-olive-soft">at {boardName}.</span>
      </h1>
    );
  }
  if (phase === "on-bus") {
    return (
      <h1 className={base}>
        Off in <span className="text-aegean-deep">{Math.max(0, minToAlight)}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
        <br />
        <span className="italic text-olive-soft">at {alightName}.</span>
      </h1>
    );
  }
  if (phase === "alight-soon") {
    return (
      <h1 className={base}>
        Step off <span className="text-ochre">next</span>
        <br />
        <span className="italic text-olive-soft">{alightName}.</span>
      </h1>
    );
  }
  return (
    <h1 className={base}>
      You're <span className="text-olive">there</span>
      <br />
      <span className="italic text-olive-soft">{Math.max(0, minToDoor)} min walk left.</span>
    </h1>
  );
}

function PhaseSub({
  phase,
  walkInSec,
  walkOutSec,
  destName,
  boardName,
  alightName,
  minToDoor,
}: {
  phase: Phase;
  walkInSec: number;
  walkOutSec: number;
  destName: string;
  boardName: string;
  alightName: string;
  minToDoor: number;
}) {
  const text =
    phase === "leave-soon"
      ? `It's a ${Math.round(walkInSec / 60)} min walk. We'll keep watching the bus while you go.`
      : phase === "walking"
      ? `${Math.round(walkInSec / 60)} min to ${boardName}. You're on schedule.`
      : phase === "waiting"
      ? `Stay near the curb at ${boardName}. We'll buzz when the doors are about to open.`
      : phase === "on-bus"
      ? `Sit back. ${Math.round(walkOutSec / 60)} min walk waiting at ${alightName}.`
      : phase === "alight-soon"
      ? `Pull the cord now. Then ${Math.round(walkOutSec / 60)} min on foot to ${destName}.`
      : `You're ${minToDoor} min from ${destName}. Mind the path.`;
  return (
    <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-soft leading-relaxed">
      <IconClock className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
      <span>{text}</span>
    </p>
  );
}

function TimelineRow({
  active,
  done,
  title,
  sub,
  accent,
  children,
}: {
  active: boolean;
  done: boolean;
  title: React.ReactNode;
  sub: React.ReactNode;
  accent?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4">
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${
          done
            ? "bg-olive/10 text-olive ring-olive/20"
            : active
            ? "bg-aegean-deep text-white ring-aegean-deep"
            : "bg-limestone-soft text-ink-soft ring-line"
        }`}
      >
        {children}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-display text-[19px] font-semibold leading-tight ${active ? "text-ink" : "text-ink-soft"}`}>
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

