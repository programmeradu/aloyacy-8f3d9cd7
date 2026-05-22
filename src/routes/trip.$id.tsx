import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowLeft, IconBus, IconClock, IconPin } from "@/components/Icons";
// StreetViewPane removed — replaced by an on-brand mini map per step.
import { useRealtime } from "@/lib/useRealtime";
import { useActiveTrip, clearActiveTrip } from "@/lib/trip-store";
import { routeTone } from "@/lib/gtfs";
import { getWalkingDirections } from "@/lib/maps.functions";
import { useJourney } from "@/lib/useJourney";
import { JourneyHUD } from "@/components/JourneyHUD";
import companionHero from "@/assets/companion-hero.jpg";

export const Route = createFileRoute("/trip/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Live trip · Aloya` },
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
  const navigate = useNavigate();
  const active = useActiveTrip();
  const { data: rt } = useRealtime();
  const [tick, setTick] = useState(0);

  // refresh every 5s for countdowns
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 5_000);
    return () => window.clearInterval(t);
  }, []);

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

    // Heuristic phase machine. Real GPS would refine this; we infer from time.
    let phase: Phase = "leave-soon";
    if (minToLeave > 1) phase = "leave-soon";
    else if (minToBoard > 1) phase = "walking";
    else if (now < boardUnix) phase = "waiting";
    else if (minToAlight > 2) phase = "on-bus";
    else if (minToAlight > -1) phase = "alight-soon";
    else phase = "arrived";

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
            No active trip
          </h1>
          <p className="mt-3 text-[13px] text-ink-soft">
            Plan a route and tap <span className="font-medium text-ink">Start</span>{" "}
            on the option you want. We'll guide you from your front door to
            theirs — countdown to leave, the bus on the move, and a gentle
            nudge when it's time to step off.
          </p>
          <Link
            to="/trips"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            Plan a trip
          </Link>
        </section>
      </AppShell>
    );
  }

  if (!view) return null;
  const { bus, walkIn, walkOut, delaySec, phase, minToLeave, minToBoard, minToAlight, minToDoor } = view;

  // Walking turn-by-turn only makes sense BEFORE boarding (walk to stop)
  // and AFTER alighting (walk to destination). While on the bus we hide it
  // entirely and lean on the live bus tracker + alight alert.
  const walkingPhase: "to-stop" | "to-dest" | null =
    phase === "leave-soon" || phase === "walking" || phase === "waiting"
      ? "to-stop"
      : phase === "arrived"
        ? "to-dest"
        : null;
  const walkLeg = walkingPhase === "to-stop" ? walkIn : walkingPhase === "to-dest" ? walkOut : null;
  const walkFrom = walkLeg && walkLeg.kind === "walk" ? walkLeg.from : null;
  const walkTo = walkLeg && walkLeg.kind === "walk" ? walkLeg.to : null;

  const fetchDirections = useServerFn(getWalkingDirections);
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

  const mapMarkers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    if (walkingPhase === "to-stop" && walkIn.kind === "walk") {
      out.push({ lat: walkIn.from.lat, lng: walkIn.from.lng, kind: "origin", label: active.from.label });
      out.push({ lat: walkIn.to.lat, lng: walkIn.to.lng, kind: "stop", label: bus.board.name });
    } else if (walkingPhase === "to-dest" && walkOut.kind === "walk") {
      out.push({ lat: walkOut.from.lat, lng: walkOut.from.lng, kind: "stop", label: bus.alight.name });
      out.push({ lat: walkOut.to.lat, lng: walkOut.to.lng, kind: "destination", label: active.to.label });
    } else {
      // On the bus: show board + alight stops so the user can watch the bus advance.
      if (walkIn.kind === "walk")
        out.push({ lat: walkIn.to.lat, lng: walkIn.to.lng, kind: "stop", label: bus.board.name });
      if (walkOut.kind === "walk")
        out.push({ lat: walkOut.from.lat, lng: walkOut.from.lng, kind: "destination", label: bus.alight.name });
    }
    return out;
  }, [walkingPhase, active, bus, walkIn, walkOut]);

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
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-ink"
        >
          End
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
        />
      </section>

      {/* Live HUD: Start button, current walking step, hurry banner,
          on-board prompt, missed-bus rescue, alight & arrived cards. */}
      <div className="mt-6">
        <JourneyHUD trip={active} live={live} steps={directions?.steps ?? null} />
      </div>

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
              {Math.round(directions.durationSec / 60)} min ·{" "}
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
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {Math.round(active.option.totalDurationSec / 60)} min total
          </span>
        </div>

        <ol className="relative rounded-[28px] bg-card ring-1 ring-line p-5 space-y-5">
          <TimelineRow
            active={phase === "leave-soon" || phase === "walking"}
            done={phase !== "leave-soon" && phase !== "walking"}
            title={`Walk to ${bus.board.name}`}
            sub={`${Math.round((walkIn.kind === "walk" ? walkIn.durationSec : 0) / 60)} min · ${Math.round((walkIn.kind === "walk" ? walkIn.distanceMeters : 0))} m`}
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
            sub={`${Math.round((walkOut.kind === "walk" ? walkOut.durationSec : 0) / 60)} min · ${Math.round((walkOut.kind === "walk" ? walkOut.distanceMeters : 0))} m`}
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
                {phase === "alight-soon" ? "Press the stop button now" : `Get ready · ${Math.max(0, minToAlight)} min`}
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
    <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${tone}`}>
      {txt} <span className="text-ink-soft">— {delay}</span>
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
        <p className={`font-display text-lg leading-tight ${active ? "text-ink" : "text-ink-soft"}`}>
          {title}
        </p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {sub}
        </p>
      </div>
      {accent}
    </li>
  );
}

function TurnStep({
  index,
  instruction,
  distanceMeters,
  maneuver,
  lat,
  lng,
  heading,
  last,
}: {
  index: number;
  instruction: string;
  distanceMeters: number;
  maneuver: string;
  lat: number;
  lng: number;
  heading: number;
  last: boolean;
}) {
  const dist =
    distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(1)} km`
      : `${Math.round(distanceMeters)} m`;
  return (
    <li className="overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <div className="relative aspect-[16/9]">
        <StreetViewPane lat={lat} lng={lng} heading={heading} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
            {index.toString().padStart(2, "0")}
          </span>
          <span className="rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-limestone">
            {(maneuver || "straight").replace(/-/g, " ")}
          </span>
        </div>
        <div className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
          {dist}
        </div>
      </div>
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {last ? "Arrive" : "Then"}
        </span>
        <p className="flex-1 font-display text-lg leading-snug text-ink">
          {instruction}
        </p>
      </div>
    </li>
  );
}
