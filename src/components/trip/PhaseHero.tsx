// Hero card pieces for the single-leg companion: state kicker, headline and
// the calm supporting line. Presentation only — every number handed in is
// already reconciled by `@aloya/core/single-leg-phase` + `companion-view`.

import type { SingleLegPhase } from "@aloya/core/single-leg-phase";
import { destBailWithHeadway, type DestBail } from "@aloya/core/dest-bail";
import { cyClock } from "@aloya/core/cy-time";
import { useHeadwayHint } from "@/lib/useHeadwayHint";
import { IconClock } from "@/components/Icons";
import { useI18n, type DictKey } from "@/lib/i18n";

export function PhaseLabel({ phase, delaySec }: { phase: SingleLegPhase; delaySec: number }) {
  const { t } = useI18n();
  const tone =
    phase === "arrived"
      ? "text-olive"
      : phase === "alight-soon"
        ? "text-ochre"
        : "text-aegean-deep";
  const txt =
    phase === "leave-soon"
      ? t("trip.phase.getReady")
      : phase === "walking"
        ? t("trip.phase.onYourWay")
        : phase === "waiting"
          ? t("trip.phase.atStop")
          : phase === "on-bus"
            ? t("trip.phase.onBoard")
            : phase === "alight-soon"
              ? t("trip.phase.almostThere")
              : t("trip.phase.arrived");
  const delay =
    delaySec > 60
      ? t("trip.delay.late", { m: Math.round(delaySec / 60) })
      : delaySec < -60
        ? t("trip.delay.early", { m: Math.round(-delaySec / 60) })
        : t("trip.delay.onTime");
  return (
    <p className={`font-sans text-[12px] font-semibold tracking-tight ${tone}`}>
      {txt} <span className="text-ink-soft/80 font-medium tabular-nums">· {delay}</span>
    </p>
  );
}

export function PhaseHeadline({
  phase,
  minToLeave,
  minToBoard,
  minToAlight,
  minToDoor,
  boardName,
  alightName,
}: {
  phase: SingleLegPhase;
  minToLeave: number;
  minToBoard: number;
  minToAlight: number;
  minToDoor: number;
  boardName: string;
  alightName: string;
}) {
  const { t } = useI18n();
  const base = "mt-2 font-display text-[40px] leading-[1.04] text-ink text-balance";
  const unit = (
    <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">
      {t("common.minUnit")}
    </span>
  );
  if (phase === "leave-soon") {
    return (
      <h1 className={base}>
        {t("trip.hl.leaveIn")} <span className="text-aegean-deep">{Math.max(0, minToLeave)}</span>
        {unit}
        <br />
        <span className="italic text-olive-soft">{t("trip.hl.walkTo", { name: boardName })}</span>
      </h1>
    );
  }
  if (phase === "walking") {
    return (
      <h1 className={base}>
        {t("trip.hl.busIn")} <span className="text-aegean-deep">{Math.max(0, minToBoard)}</span>
        {unit}
        <br />
        <span className="italic text-olive-soft">
          {t("trip.hl.keepHeading", { name: boardName })}
        </span>
      </h1>
    );
  }
  if (phase === "waiting") {
    return (
      <h1 className={base}>
        {t("trip.hl.boardsIn")} <span className="text-aegean-deep">{Math.max(0, minToBoard)}</span>
        {unit}
        <br />
        <span className="italic text-olive-soft">{t("trip.hl.at", { name: boardName })}</span>
      </h1>
    );
  }
  if (phase === "on-bus") {
    return (
      <h1 className={base}>
        {t("trip.hl.offIn")} <span className="text-aegean-deep">{Math.max(0, minToAlight)}</span>
        {unit}
        <br />
        <span className="italic text-olive-soft">{t("trip.hl.at", { name: alightName })}</span>
      </h1>
    );
  }
  if (phase === "alight-soon") {
    return (
      <h1 className={base}>
        {t("trip.hl.stepOff")} <span className="text-ochre">{t("trip.hl.next")}</span>
        <br />
        <span className="italic text-olive-soft">{alightName}.</span>
      </h1>
    );
  }
  return (
    <h1 className={base}>
      {t("trip.hl.youreThere")} <span className="text-olive">{t("trip.hl.there")}</span>
      <br />
      <span className="italic text-olive-soft">
        {t("trip.hl.minWalkLeft", { m: Math.max(0, minToDoor) })}
      </span>
    </h1>
  );
}

export function PhaseSub({
  phase,
  walkInSec,
  walkOutSec,
  destName,
  boardName,
  alightName,
  minToDoor,
  destBail,
  routeId,
  stopId,
}: {
  phase: SingleLegPhase;
  walkInSec: number;
  walkOutSec: number;
  destName: string;
  boardName: string;
  alightName: string;
  minToDoor: number;
  destBail?: DestBail | null;
  routeId?: string;
  stopId?: string;
}) {
  const { t } = useI18n();
  const keep = destBail?.kind === "keepWait" ? destBail : null;
  const hint = useHeadwayHint({
    routeId: keep ? routeId : null,
    stopId: keep ? stopId : null,
    arrivalUnix: keep ? Math.floor(Date.now() / 1000) + keep.waitMin * 60 : null,
  });
  const action = destBailWithHeadway(destBail ?? null, hint);
  const text =
    phase === "leave-soon"
      ? t("trip.sub.leaveSoon", { m: Math.round(walkInSec / 60) })
      : phase === "walking"
        ? t("trip.sub.walking", { m: Math.round(walkInSec / 60), name: boardName })
        : phase === "waiting"
          ? t("trip.sub.waiting", { name: boardName })
          : phase === "on-bus"
            ? t("trip.sub.onBus", { m: Math.round(walkOutSec / 60), name: alightName })
            : phase === "alight-soon"
              ? t("trip.sub.alightSoon", { m: Math.round(walkOutSec / 60), name: destName })
              : t("trip.sub.arrived", { m: minToDoor, name: destName });
  return (
    <>
      <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-soft leading-relaxed">
        <IconClock className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
        <span>{text}</span>
      </p>
      {action && <DestBailLine action={action} t={t} />}
    </>
  );
}

function DestBailLine({
  action,
  t,
}: {
  action: DestBail;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  let line = "";
  switch (action.kind) {
    case "walk":
      line = t("ml.destBail.walk", {
        dest: action.destLabel,
        min: action.walkMin,
        route: action.routeShort,
      });
      break;
    case "keepWait":
      if (action.chancePct != null && action.beforeUnix != null) {
        line =
          action.waitMin <= 0
            ? t("ml.destBail.keepWaitDueChance", {
                walk: action.walkMin,
                route: action.routeShort,
                pct: action.chancePct,
                time: cyClock(action.beforeUnix * 1000),
              })
            : t("ml.destBail.keepWaitChance", {
                walk: action.walkMin,
                route: action.routeShort,
                wait: action.waitMin,
                pct: action.chancePct,
                time: cyClock(action.beforeUnix * 1000),
              });
      } else {
        line =
          action.waitMin <= 0
            ? t("ml.destBail.keepWaitDue", { walk: action.walkMin, route: action.routeShort })
            : t("ml.destBail.keepWait", {
                walk: action.walkMin,
                route: action.routeShort,
                wait: action.waitMin,
              });
      }
      break;
    case "raptorWalk":
      line = t("ml.destBail.raptorWalk", {
        walk: action.walkMin,
        route: action.routeShort,
      });
      break;
    case "boltScooter":
      line = t("ml.destBail.boltScooter", {
        price: action.priceFrom,
        route: action.routeShort,
      });
      break;
    case "taxi":
      if (action.destLabel && action.driveMin != null && action.waitMin != null) {
        line =
          action.waitMin <= 0
            ? t("ml.destBail.taxiDoorDue", {
                dest: action.destLabel,
                drive: action.driveMin,
                price: action.priceFrom,
                route: action.routeShort,
              })
            : t("ml.destBail.taxiDoor", {
                dest: action.destLabel,
                drive: action.driveMin,
                price: action.priceFrom,
                route: action.routeShort,
                wait: action.waitMin,
              });
      } else {
        line = t("ml.destBail.taxi", {
          price: action.priceFrom,
          route: action.routeShort,
        });
      }
      break;
  }
  return <p className="mt-2 text-[13px] leading-snug text-ink-soft">{line}</p>;
}
