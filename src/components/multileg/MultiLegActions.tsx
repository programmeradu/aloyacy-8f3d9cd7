// The action HUD under the hero: the one thing the rider can do right now,
// which changes with the live phase of the journey.

import { useNavigate } from "@tanstack/react-router";
import { IconArrowUpRight, IconBus, IconPin } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import {
  multiLegConfirmOnBoard,
  multiLegMarkArrived,
  type MultiLegLive,
} from "@/lib/useMultiLegJourney";
import { startLiveTracking } from "@/lib/useJourney";
import { requestCompassPermission } from "@/lib/useCompass";

export function MultiLegActions({
  live,
  active,
  onImOff,
}: {
  live: MultiLegLive;
  active: ActiveTrip;
  onImOff: () => void;
}) {
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
          <p className="mt-2 text-[13px] text-ink-soft">{t("ml.act.startBody")}</p>
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
          <p className="mt-2 text-[13px] text-ink-soft">{t("ml.act.finalBody")}</p>
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
