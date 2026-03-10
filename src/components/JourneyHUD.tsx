// Live journey HUD: Start button → live walking card with countdown to next
// turn → at-stop confirmation → on-board prompt → press-stop alert →
// arrival. Renders only the bits relevant to the current live phase.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import liveGuidanceImg from "@/assets/live-guidance.jpg";
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
import { fmtEta as fmtMinutes } from "@/lib/journey-copy";
import { useI18n } from "@/lib/i18n";
import { SightingButton } from "@/components/SightingButton";
import { getStop } from "@/lib/gtfs";

function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
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
  const { t } = useI18n();
  return (
    <section className="px-6 animate-rise" style={{ animationDelay: "100ms" }}>
      <div className="overflow-hidden rounded-[28px] bg-card ring-1 ring-line">
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          <img
            src={liveGuidanceImg}
            alt="A bus on a coastal Cyprus road at golden hour"
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            width={1280}
            height={720}
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/55 to-transparent" />
          <p className="absolute left-5 top-5 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-limestone">
            {t("hud.liveGuidance")}
          </p>
        </div>
        <div className="p-5">
          <p className="font-display text-[26px] leading-tight text-ink text-balance">
            {t("hud.startTitle", { name: trip.to.label })}
          </p>
          <p className="mt-2 font-sans text-[14px] leading-relaxed text-ink-soft">
            {t("hud.startBody")}
          </p>
          <button
            onClick={async () => {
              await requestCompassPermission();
              startLiveTracking();
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-sans text-[14px] font-semibold tracking-tight text-limestone"
          >
            {t("hud.startCta")}
            <IconArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

// ----- Hurry ----------------------------------------------------------------

function HurryBanner({ urgent, live }: { urgent: boolean; live: LiveJourney }) {
  const { t } = useI18n();
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
            {urgent ? t("hud.hurry.urgentTitle") : t("hud.hurry.softTitle")}
          </p>
          {urgent && (
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ochre opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-ochre" />
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-[26px] leading-tight text-ink">
          {t("hud.hurry.headline", {
            board: fmtMinutes(live.secsToBoard),
            walk: fmtMinutes(live.walkingEtaSec),
          })}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {urgent ? t("hud.hurry.urgentBody") : t("hud.hurry.softBody")}
        </p>
      </div>
    </section>
  );
}

// ----- Live walking step ----------------------------------------------------

function LiveStepCard({ live, steps }: { live: LiveJourney; steps: WalkStep[] }) {
  const { t } = useI18n();
  const idx = Math.min(live.currentStepIndex, steps.length - 1);
  const step = steps[idx];
  const next = steps[idx + 1];
  const isFinal = idx === steps.length - 1;

  return (
    <section className="px-6 animate-rise">
      <article className="rounded-[28px] bg-card ring-1 ring-line p-5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            {live.phase === "walking-to-dest" ? t("hud.walking.toDest") : t("hud.walking.toStop")}
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
              {t("hud.walking.then")}
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
  const { t } = useI18n();
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  const needsSighting = live.tripGhost || live.vehicleNotTracked || live.feedStale;
  return (
    <section className="px-6 animate-rise space-y-3">
      <div className="rounded-[28px] bg-olive-soft/40 ring-1 ring-olive/25 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
          {t("hud.atStop.label")}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.atStop.headline", { code: bus.routeShort, min: fmtMinutes(live.secsToBoard) })}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {t("hud.atStop.body", { name: bus.board.name })}
        </p>
      </div>
      {needsSighting && (
        <SightingButton
          tripId={bus.tripId}
          routeId={bus.routeId}
          stopId={bus.board.stopId}
          lat={bus.board.lat}
          lng={bus.board.lng}
        />
      )}
    </section>
  );
}

// ----- Boarding prompt (on-board confirmation) ------------------------------

function BoardingPrompt({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const { t } = useI18n();
  const bus = trip.option.legs.find((l) => l.kind === "bus");

  // 30-second auto-confirm when GPS strongly suggests onboard.
  const [secondsLeft, setSecondsLeft] = useState(30);
  useEffect(() => {
    if (!live.onBoardSuggested) {
      setSecondsLeft(30);
      return;
    }
    const tm = window.setInterval(() => {
      setSecondsLeft((n) => {
        if (n <= 1) {
          window.clearInterval(tm);
          confirmOnBoard();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(tm);
  }, [live.onBoardSuggested]);

  if (!bus || bus.kind !== "bus") return null;
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-aegean-soft/50 ring-1 ring-aegean/30 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
          {t("hud.board.label")}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.board.headline", { code: bus.routeShort, long: bus.routeLong })}
        </p>
        <p className="mt-2 text-[13px] text-ink-soft">
          {live.onBoardSuggested
            ? t("hud.board.bodyAuto", { s: secondsLeft })
            : t("hud.board.body", { name: bus.alight.name })}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => confirmOnBoard()}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            {t("hud.board.onboard")}
            <IconBus className="size-3.5" />
          </button>
          <button
            onClick={() => markMissed()}
            className="inline-flex items-center gap-2 rounded-full bg-card ring-1 ring-line px-5 py-3 text-[13px] text-ink"
          >
            {t("hud.board.missed")}
          </button>
        </div>
      </div>
    </section>
  );
}

// ----- Missed bus → rescue --------------------------------------------------

function MissedBusCard({ trip }: { trip: ActiveTrip }) {
  const { t } = useI18n();
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
        setErr(error ?? t("hud.missed.err"));
        return;
      }
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
      setErr(e instanceof Error ? e.message : t("hud.missed.err"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-ochre-soft ring-1 ring-ochre/40 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
          {t("hud.missed.label")}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.missed.title")}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {t("hud.missed.body", { name: trip.to.label })}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            disabled={loading}
            onClick={rescue}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone disabled:opacity-60"
          >
            {loading ? t("hud.missed.finding") : t("hud.missed.find")}
            <IconArrowUpRight className="size-3.5" />
          </button>
          <button
            onClick={() => {
              clearActiveTrip();
              navigate({ to: "/trips" });
            }}
            className="inline-flex items-center gap-2 rounded-full bg-card ring-1 ring-line px-5 py-3 text-[13px] text-ink"
          >
            {t("trip.endTrip")}
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
  const { t } = useI18n();
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  const eta = live.fusedSecsToAlight > 0 ? live.fusedSecsToAlight : live.secsToAlight;
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
          {t("hud.riding.label", { code: bus.routeShort })}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.riding.headline", { min: fmtMinutes(eta), name: bus.alight.name })}
        </p>
        <p className="mt-2 flex items-start gap-2 text-[13px] text-ink-soft">
          <IconClock className="mt-0.5 size-3.5 shrink-0" />
          <span>{live.vehicleLost ? t("hud.riding.lost") : t("hud.riding.calm")}</span>
        </p>
        {live.phase === "alight-soon" && (
          <button
            onClick={() => markAlighted()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            {t("hud.riding.imOff")}
            <IconPin className="size-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}

// ----- Arrived --------------------------------------------------------------

function ArrivedCard({ trip }: { trip: ActiveTrip }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-olive-soft ring-1 ring-olive/30 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
          {t("hud.arrived.label")}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.arrived.title", { name: trip.to.label })}
        </p>
        <button
          onClick={() => {
            clearActiveTrip();
            navigate({ to: "/" });
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
        >
          {t("hud.arrived.done")}
        </button>
      </div>
    </section>
  );
}
