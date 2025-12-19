// Live journey HUD: Start button → live walking card with countdown to next
// turn → at-stop confirmation → on-board prompt → press-stop alert →
// arrival. Renders only the bits relevant to the current live phase.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { IconArrowUpRight, IconBus, IconClock, IconPin } from "@/components/Icons";
import {
  startLiveTracking,
  confirmOnBoard,
  markMissed,
  markAlighted,
  type LiveJourney,
} from "@/lib/useJourney";
import { requestCompassPermission } from "@/lib/useCompass";
import type { ActiveTrip } from "@/lib/trip-store";
import { setActiveTrip, clearActiveTrip } from "@/lib/trip-store";
import { planTrip } from "@/lib/journey.functions";
import type { WalkStep } from "@/lib/geo";

function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function fmtMinutes(s: number): string {
  return `${Math.max(0, Math.round(s / 60))} min`;
}

export function JourneyHUD({
  trip,
  live,
  steps,
}: {
  trip: ActiveTrip;
  live: LiveJourney;
  steps: WalkStep[] | null;
}) {
  if (!live.active) {
    return <StartCard trip={trip} />;
  }

  return (
    <div className="space-y-5">
      {/* Hurry banner — soft or urgent */}
      {(live.phase === "hurry-soft" || live.phase === "hurry-urgent") && (
        <HurryBanner urgent={live.phase === "hurry-urgent"} live={live} />
      )}

      {/* Walking turn-by-turn live card */}
      {(live.phase === "walking-to-stop" ||
        live.phase === "hurry-soft" ||
        live.phase === "hurry-urgent" ||
        live.phase === "walking-to-dest") &&
        steps &&
        steps.length > 0 && (
          <LiveStepCard live={live} steps={steps} />
        )}

      {/* Arrived at stop */}
      {live.phase === "at-stop" && <AtStopCard trip={trip} live={live} />}

      {/* Bus is at the stop — confirm boarding */}
      {live.phase === "boarding" && (
        <BoardingPrompt trip={trip} live={live} />
      )}

      {/* Bus left without us */}
      {live.phase === "missed-bus" && <MissedBusCard trip={trip} />}

      {/* On bus — manual "I'm off" button surfaces after alight-soon */}
      {(live.phase === "on-bus" || live.phase === "alight-soon") && (
        <RidingCard trip={trip} live={live} />
      )}

      {/* Final arrival */}
      {live.phase === "arrived" && <ArrivedCard trip={trip} />}
    </div>
  );
}

// ----- Start ----------------------------------------------------------------

function StartCard({ trip }: { trip: ActiveTrip }) {
  return (
    <section className="px-6 animate-rise" style={{ animationDelay: "100ms" }}>
      <div className="rounded-[28px] bg-aegean-soft/40 ring-1 ring-aegean/20 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
          Live guidance
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          Start the journey to {trip.to.label}.
        </p>
        <p className="mt-2 text-[13px] text-ink-soft">
          We will follow your steps, alert you to hurry if the bus is close,
          let you know when you reach the stop, and guide you off at the
          right moment.
        </p>
        <button
          onClick={async () => {
            // Piggyback the iOS compass permission on the user gesture so we
            // can show a heading cone on the live map.
            await requestCompassPermission();
            startLiveTracking();
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
        >
          Start journey
          <IconArrowUpRight className="size-3.5" />
        </button>
      </div>
    </section>
  );
}

// ----- Hurry ----------------------------------------------------------------

function HurryBanner({ urgent, live }: { urgent: boolean; live: LiveJourney }) {
  return (
    <section className="px-6 animate-rise">
      <div
        className={`rounded-[28px] p-5 ring-1 ${
          urgent
            ? "bg-ochre-soft ring-ochre/40"
            : "bg-ochre-soft/50 ring-ochre/25"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
            {urgent ? "Hurry — bus is arriving" : "Pick up the pace"}
          </p>
          {urgent && (
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ochre opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-ochre" />
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-[26px] leading-tight text-ink">
          {fmtMinutes(live.secsToBoard)} to bus — {fmtMinutes(live.walkingEtaSec)}{" "}
          on foot
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {urgent
            ? "You will miss it at your current pace. Quicken up or we'll find the next one."
            : "It's going to be tight. Keep moving and you'll just catch it."}
        </p>
      </div>
    </section>
  );
}

// ----- Live walking step ----------------------------------------------------

function LiveStepCard({ live, steps }: { live: LiveJourney; steps: WalkStep[] }) {
  const idx = Math.min(live.currentStepIndex, steps.length - 1);
  const step = steps[idx];
  const next = steps[idx + 1];
  const isFinal = idx === steps.length - 1;

  return (
    <section className="px-6 animate-rise">
      <article className="rounded-[28px] bg-card ring-1 ring-line p-5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            {live.phase === "walking-to-dest" ? "Walking to destination" : "Walking to stop"}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {fmtMeters(live.metersToDestination)} — {fmtMinutes(live.walkingEtaSec)}
          </p>
        </div>

        <p className="mt-3 font-display text-[32px] leading-[1.05] text-ink text-balance">
          {step.instruction}
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
          {fmtMeters(live.metersToStepEnd)} — {(step.maneuver || "straight").replace(/-/g, " ")}
        </p>

        {next && !isFinal && (
          <div className="mt-4 border-t border-line/70 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Then
            </p>
            <p className="mt-1 font-display text-[15px] leading-snug text-ink-soft">
              {next.instruction}
            </p>
          </div>
        )}
      </article>
    </section>
  );
}

// ----- At stop --------------------------------------------------------------

function AtStopCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-olive-soft/40 ring-1 ring-olive/25 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
          You're at the stop
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          BUS {bus.routeShort} in {fmtMinutes(live.secsToBoard)}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          Stay near the curb at {bus.board.name}. We'll prompt you the moment
          the bus pulls in.
        </p>
      </div>
    </section>
  );
}

// ----- Boarding prompt (on-board confirmation) ------------------------------

function BoardingPrompt({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");

  // 30-second auto-confirm when GPS strongly suggests onboard.
  const [secondsLeft, setSecondsLeft] = useState(30);
  useEffect(() => {
    if (!live.onBoardSuggested) {
      setSecondsLeft(30);
      return;
    }
    const t = window.setInterval(() => {
      setSecondsLeft((n) => {
        if (n <= 1) {
          window.clearInterval(t);
          confirmOnBoard();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [live.onBoardSuggested]);

  if (!bus || bus.kind !== "bus") return null;
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-aegean-soft/50 ring-1 ring-aegean/30 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
          Are you on board?
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          BUS {bus.routeShort} — {bus.routeLong}
        </p>
        <p className="mt-2 text-[13px] text-ink-soft">
          {live.onBoardSuggested
            ? `Looks like you boarded. Auto-confirming in ${secondsLeft}s.`
            : `Confirm so we can switch to ride mode and watch for ${bus.alight.name}.`}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => confirmOnBoard()}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            I'm on board
            <IconBus className="size-3.5" />
          </button>
          <button
            onClick={() => markMissed()}
            className="inline-flex items-center gap-2 rounded-full bg-card ring-1 ring-line px-5 py-3 text-[13px] text-ink"
          >
            Missed it
          </button>
        </div>
      </div>
    </section>
  );
}

// ----- Missed bus → rescue --------------------------------------------------

function MissedBusCard({ trip }: { trip: ActiveTrip }) {
  const navigate = useNavigate();
  const fetchPlan = useServerFn(planTrip);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rescue = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { options, error } = await fetchPlan({
        data: { from: { lat: trip.from.lat, lng: trip.from.lng }, to: { lat: trip.to.lat, lng: trip.to.lng } },
      });
      if (error || !options || options.length === 0) {
        setErr(error ?? "No nearby options. Try again in a moment.");
        return;
      }
      // Swap in the next option, keep tracking the same endpoints.
      const next = options[0];
      setActiveTrip({
        startedAt: Date.now(),
        option: next,
        from: trip.from,
        to: trip.to,
        live: { startedAt: Date.now() },
      });
      navigate({ to: "/trip/$id", params: { id: next.id } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not find another option.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-ochre-soft ring-1 ring-ochre/40 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
          The bus has left
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          Let's find the next one.
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          We'll re-plan from where you are now, including nearby stops that
          might have an earlier ride to {trip.to.label}.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            disabled={loading}
            onClick={rescue}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone disabled:opacity-60"
          >
            {loading ? "Finding…" : "Find next ride"}
            <IconArrowUpRight className="size-3.5" />
          </button>
          <button
            onClick={() => {
              clearActiveTrip();
              navigate({ to: "/trips" });
            }}
            className="inline-flex items-center gap-2 rounded-full bg-card ring-1 ring-line px-5 py-3 text-[13px] text-ink"
          >
            End trip
          </button>
        </div>
        {err && (
          <p className="mt-3 font-mono text-[11px] text-ochre">{err}</p>
        )}
      </div>
    </section>
  );
}

// ----- Riding ---------------------------------------------------------------

function RidingCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  const eta = live.fusedSecsToAlight > 0 ? live.fusedSecsToAlight : live.secsToAlight;
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
          On board — BUS {bus.routeShort}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          Off in {fmtMinutes(eta)} at {bus.alight.name}.
        </p>
        <p className="mt-2 flex items-start gap-2 text-[13px] text-ink-soft">
          <IconClock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {live.vehicleLost
              ? "Feed lost the bus, so we're using your phone as the bus and keeping the stop countdown on your movement."
              : "Sit back. We'll buzz when it's time to press the stop button."}
          </span>
        </p>
        {live.phase === "alight-soon" && (
          <button
            onClick={() => markAlighted()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            I'm off
            <IconPin className="size-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}

// ----- Arrived --------------------------------------------------------------

function ArrivedCard({ trip }: { trip: ActiveTrip }) {
  const navigate = useNavigate();
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-olive-soft ring-1 ring-olive/30 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
          You've arrived
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          Welcome to {trip.to.label}.
        </p>
        <button
          onClick={() => {
            clearActiveTrip();
            navigate({ to: "/" });
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
        >
          Done
        </button>
      </div>
    </section>
  );
}
