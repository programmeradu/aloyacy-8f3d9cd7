// Three-step journey timeline (walk → ride → walk) for the single-leg
// companion, plus the "press stop" alert that rides under it.

import type { ReactNode } from "react";
import type { SingleLegPhase } from "@aloya/core/single-leg-phase";
import type { JourneyOption } from "@/lib/journey.server";
import { RouteChip } from "@/components/RouteChip";
import { IconBus, IconPin } from "@/components/Icons";
import { routeTone } from "@/lib/gtfs";
import { useI18n } from "@/lib/i18n";

type Leg = JourneyOption["legs"][number];
type BusLeg = Extract<Leg, { kind: "bus" }>;

const walkMin = (leg: Leg) => Math.round((leg.kind === "walk" ? leg.durationSec : 0) / 60);
const walkMeters = (leg: Leg) => Math.round(leg.kind === "walk" ? leg.distanceMeters : 0);

export function TimelineRow({
  active,
  done,
  title,
  sub,
  accent,
  children,
}: {
  active: boolean;
  done: boolean;
  title: ReactNode;
  sub: ReactNode;
  accent?: ReactNode;
  children: ReactNode;
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
        <p
          className={`font-display text-[19px] font-semibold leading-tight ${active ? "text-ink" : "text-ink-soft"}`}
        >
          {title}
        </p>
        <p className="mt-1 font-sans text-[13px] font-medium text-ink-soft leading-snug">{sub}</p>
      </div>
      {accent}
    </li>
  );
}

export function JourneyTimeline({
  phase,
  bus,
  walkIn,
  walkOut,
  destLabel,
  totalDurationSec,
}: {
  phase: SingleLegPhase;
  bus: BusLeg;
  walkIn: Leg;
  walkOut: Leg;
  destLabel: string;
  totalDurationSec: number;
}) {
  const { t } = useI18n();
  return (
    <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">{t("trip.yourJourney")}</h2>
        <span className="font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
          {t("trip.minTotal", { m: Math.round(totalDurationSec / 60) })}
        </span>
      </div>

      <ol className="relative rounded-[28px] bg-card ring-1 ring-line p-5 space-y-5">
        <TimelineRow
          active={phase === "leave-soon" || phase === "walking"}
          done={phase !== "leave-soon" && phase !== "walking"}
          title={t("trip.walkToName", { name: bus.board.name })}
          sub={t("trip.walkMeters", { m: walkMin(walkIn), d: walkMeters(walkIn) })}
        >
          <IconPin className="size-3.5" />
        </TimelineRow>

        <TimelineRow
          active={phase === "waiting" || phase === "on-bus" || phase === "alight-soon"}
          done={phase === "arrived"}
          title={
            <>
              {t("trip.boardBusPrefix")}{" "}
              <span className="text-aegean-deep">
                {t("trip.boardBusName", { code: bus.routeShort })}
              </span>{" "}
              — {bus.routeLong}
            </>
          }
          sub={t("trip.alightAt", { name: bus.alight.name })}
          accent={<RouteChip code={bus.routeShort} tone={routeTone(bus.routeId)} size="sm" />}
        >
          <IconBus className="size-3.5" />
        </TimelineRow>

        <TimelineRow
          active={phase === "alight-soon" || phase === "arrived"}
          done={false}
          title={t("trip.walkToName", { name: destLabel })}
          sub={t("trip.walkMeters", { m: walkMin(walkOut), d: walkMeters(walkOut) })}
        >
          <IconPin className="size-3.5" />
        </TimelineRow>
      </ol>
    </section>
  );
}

export function AlightAlert({
  phase,
  minToAlight,
  alightName,
  destLabel,
  walkOutSec,
}: {
  phase: SingleLegPhase;
  minToAlight: number;
  alightName: string;
  destLabel: string;
  walkOutSec: number;
}) {
  const { t } = useI18n();
  const imminent = phase === "alight-soon";
  return (
    <section className="mt-5 px-6 animate-rise">
      <div
        className={`rounded-[28px] p-5 ring-1 transition-colors ${
          imminent ? "bg-ochre-soft ring-ochre/40" : "bg-ochre-soft/60 ring-ochre/25"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
            {imminent
              ? t("trip.alight.press")
              : t("trip.alight.getReady", { m: Math.max(0, minToAlight) })}
          </p>
          {imminent && (
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ochre opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-ochre" />
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-[26px] leading-tight text-ink">{alightName}</p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {imminent
            ? t("trip.alight.body.now", { name: destLabel })
            : t("trip.alight.body.soon", { m: Math.round(walkOutSec / 60), name: destLabel })}
        </p>
      </div>
    </section>
  );
}
