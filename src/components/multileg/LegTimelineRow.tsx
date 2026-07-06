// One row of the journey timeline: ride, walk or wait, with done / active /
// upcoming styling.

import type React from "react";
import { IconBus, IconClock, IconPin } from "@/components/Icons";
import { RouteChip } from "@/components/RouteChip";
import { routeTone } from "@/lib/gtfs";
import { fmtEta as fmtMin, fmtClock as fmtTime } from "@/lib/journey-copy";
import { useI18n } from "@/lib/i18n";
import type { Leg, WalkLeg, WaitLeg } from "@/lib/itinerary-types";

export function LegTimelineRow({
  leg,
  isActive,
  isDone,
}: {
  leg: Leg;
  isActive: boolean;
  isDone: boolean;
}) {
  const { t } = useI18n();
  const ring = isDone
    ? "bg-olive/10 text-olive ring-olive/20"
    : isActive
      ? "bg-aegean-deep text-white ring-aegean-deep"
      : "bg-limestone-soft text-ink-soft ring-line";

  let glyph: React.ReactNode = null;
  let title: React.ReactNode = null;
  let sub: React.ReactNode = null;
  let accent: React.ReactNode = null;

  if (leg.kind === "ride") {
    glyph = <IconBus className="size-3.5" />;
    title = (
      <>
        {t("ml.timeline.boardPrefix")}{" "}
        <span className="text-aegean-deep">{t("trip.boardBusName", { code: leg.routeShort })}</span>{" "}
        — {leg.routeLong}
      </>
    );
    sub = t("ml.timeline.rideSub", {
      from: leg.board.name,
      to: leg.alight.name,
      dep: fmtTime(leg.board.departureUnix),
      arr: fmtTime(leg.alight.arrivalUnix),
      n: leg.stopCount,
    });
    accent = <RouteChip code={leg.routeShort} tone={routeTone(leg.routeId)} size="sm" />;
  } else if (leg.kind === "walk") {
    glyph = <IconPin className="size-3.5" />;
    title = (
      <>
        {t("ml.timeline.walkTo")} <span className="text-ink">{(leg as WalkLeg).to.name}</span>
      </>
    );
    sub = t("ml.timeline.walkSub", {
      min: fmtMin((leg as WalkLeg).durationSec),
      d: (leg as WalkLeg).distanceMeters,
    });
  } else {
    glyph = <IconClock className="size-3.5" />;
    title = <>{t("ml.timeline.waitAt", { name: (leg as WaitLeg).name })}</>;
    sub = t("ml.timeline.waitSub", { min: fmtMin((leg as WaitLeg).durationSec) });
  }

  return (
    <li className="flex items-start gap-4">
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${ring}`}
      >
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`font-display text-[19px] font-semibold leading-tight ${isActive ? "text-ink" : "text-ink-soft"}`}
        >
          {title}
        </p>
        <p className="mt-1 font-sans text-[13px] font-medium text-ink-soft leading-snug">{sub}</p>
      </div>
      {accent}
    </li>
  );
}
