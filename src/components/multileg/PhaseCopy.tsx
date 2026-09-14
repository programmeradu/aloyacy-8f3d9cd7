import { DestBailLine } from './DestBailLine';
// Hero copy for the multi-leg companion: the phase eyebrow, the big
// headline and the supporting line. Kept apart from the companion shell so
// the copy logic can change without touching layout or live wiring.

import { IconClock } from "@/components/Icons";
import { fmtEta as fmtMin } from "@/lib/journey-copy";
import { destBailForWait, destBailWithHeadway, type DestBail } from "@aloya/core/dest-bail";
import { cyClock } from "@aloya/core/cy-time";
import { useHeadwayHint } from "@/lib/useHeadwayHint";
import { useI18n, type DictKey } from "@/lib/i18n";
import type { Itinerary, RideLeg } from "@/lib/itinerary-types";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { upgradeDestBail } from "@/lib/dest-bail.functions";

function useBailUpgrade(
  live: MultiLegLive,
  raw: DestBail | null,
  dest?: { lat: number; lng: number },
) {
  const upgradeFn = useServerFn(upgradeDestBail);
  const ride = live.currentRideLeg;
  
  const query = useQuery({
    queryKey: ["bailUpgrade", ride?.tripId, raw?.kind, dest?.lat, dest?.lng],
    queryFn: async () => {
      if (!raw || raw.kind !== "keepWait" || !dest || !ride) return null;
      if (!live.tripGhost) return null;
      
      const from = live.fix ?? { lat: ride.board.lat, lng: ride.board.lng };
      return upgradeFn({
        data: {
          from,
          destination: dest,
          routeShort: raw.routeShort,
          waitMin: raw.waitMin,
        },
      });
    },
    enabled: raw?.kind === "keepWait" && live.tripGhost && !!dest,
    staleTime: 60_000,
  });

  return query.data || raw;
}

export function PhaseLabel({ live, itin }: { live: MultiLegLive; itin: Itinerary }) {
  const { t } = useI18n();
  const tone =
    live.phase === "arrived"
      ? "text-olive"
      : live.phase === "alight-soon"
        ? "text-ochre"
        : live.nextBoardLate
          ? "text-ochre"
          : "text-aegean-deep";
  const text =
    live.phase === "idle"
      ? t("ml.phase.ready")
      : live.phase === "walking-to-board"
        ? t("ml.phase.walkFirst")
        : live.phase === "waiting-to-board"
          ? t("ml.phase.waitFor", { code: live.currentRideLeg?.routeShort ?? "" })
          : live.phase === "riding"
            ? t("ml.phase.onBus", {
                code: live.currentRideLeg?.routeShort ?? "",
                n: live.rideOrdinal,
                total: live.totalRides,
              })
            : live.phase === "alight-soon"
              ? t("ml.phase.alightNext")
              : live.phase === "walking-to-transfer"
                ? t("ml.phase.walkToBus", { code: live.nextRideLeg?.routeShort ?? "" })
                : live.phase === "waiting-for-connection"
                  ? t("ml.phase.waitFor", { code: live.nextRideLeg?.routeShort ?? "" })
                  : live.phase === "walking-to-destination"
                    ? t("ml.phase.finalWalk")
                    : t("ml.phase.arrived");
  const detail =
    live.phase === "waiting-for-connection" && live.nextRideLeg
      ? live.nextBoardLate
        ? t("ml.detail.late")
        : live.nextBoardSource === "live"
          ? t("ml.detail.liveTracking")
          : t("ml.detail.scheduled")
      : itin.source === "live"
        ? t("ml.detail.live")
        : itin.source === "mixed"
          ? t("ml.detail.mixed")
          : t("ml.detail.scheduled");
  return (
    <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${tone}`}>
      {text} <span className="text-ink-soft">— {detail}</span>
    </p>
  );
}

export function PhaseHeadline({ live, itin }: { live: MultiLegLive; itin: Itinerary }) {
  const { t } = useI18n();
  const base = "mt-2 font-display text-[36px] leading-[1.05] text-ink text-balance";
  if (live.phase === "walking-to-board" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.walkTo")}{" "}
        <span className="text-aegean-deep">{live.currentRideLeg.board.name}</span>
        <br />
        <span className="italic text-olive-soft">
          {t("ml.hl.busInBoard", {
            code: live.currentRideLeg.routeShort,
            min: fmtMin(live.secsToCurrentBoard),
          })}
        </span>
      </h1>
    );
  }
  if (live.phase === "waiting-to-board" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.busIn", { code: live.currentRideLeg.routeShort })}{" "}
        <span className="text-aegean-deep">
          {Math.max(0, Math.round(live.secsToCurrentBoard / 60))}
        </span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">
          {t("common.minUnit")}
        </span>
        <br />
        <span className="italic text-olive-soft">
          {t("ml.hl.atName", { name: live.currentRideLeg.board.name })}
        </span>
      </h1>
    );
  }
  if (live.phase === "riding" && live.currentRideLeg) {
    const tail = live.nextRideLeg
      ? t("ml.hl.atNameThenChange", {
          name: live.currentRideLeg.alight.name,
          code: live.nextRideLeg.routeShort,
        })
      : t("ml.hl.atNameDot", { name: live.currentRideLeg.alight.name });
    return (
      <h1 className={base}>
        {t("ml.hl.offIn")}{" "}
        <span className="text-aegean-deep">
          {Math.max(0, Math.round(live.secsToCurrentAlight / 60))}
        </span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">
          {t("common.minUnit")}
        </span>
        <br />
        <span className="italic text-olive-soft">{tail}</span>
      </h1>
    );
  }
  if (live.phase === "alight-soon" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.stepOff")} <span className="text-ochre">{t("ml.hl.next")}</span>
        <br />
        <span className="italic text-olive-soft">{live.currentRideLeg.alight.name}.</span>
      </h1>
    );
  }
  if (
    live.phase === "walking-to-transfer" &&
    live.nextRideLeg &&
    live.currentLeg?.kind === "walk"
  ) {
    return (
      <h1 className={base}>
        {t("ml.hl.walkTo")} <span className="text-aegean-deep">{live.nextRideLeg.board.name}</span>
        <br />
        <span className="italic text-olive-soft">
          {t("ml.hl.walkForBus", {
            code: live.nextRideLeg.routeShort,
            min: fmtMin(live.currentLeg.durationSec),
          })}
        </span>
      </h1>
    );
  }
  if (live.phase === "waiting-for-connection" && live.nextRideLeg) {
    return (
      <h1 className={base}>
        {t("ml.hl.busIn", { code: live.nextRideLeg.routeShort })}{" "}
        <span className={live.nextBoardLate ? "text-ochre" : "text-aegean-deep"}>
          {Math.max(0, Math.round(live.secsToNextBoard / 60))}
        </span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">
          {t("common.minUnit")}
        </span>
        <br />
        <span className="italic text-olive-soft">
          {t("ml.hl.atName", { name: live.nextRideLeg.board.name })}
        </span>
      </h1>
    );
  }
  if (live.phase === "walking-to-destination") {
    return (
      <h1 className={base}>
        {t("ml.hl.finalStretch")}
        <br />
        <span className="italic text-olive-soft">
          {t("ml.hl.minOnFoot", {
            m: Math.max(
              0,
              Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60),
            ),
          })}
        </span>
      </h1>
    );
  }
  if (live.phase === "arrived") {
    return (
      <h1 className={base}>
        {t("ml.hl.youreThere")} <span className="text-olive">{t("ml.hl.there")}</span>
        <br />
        <span className="italic text-olive-soft">{t("ml.hl.welcome")}</span>
      </h1>
    );
  }
  // idle — pre-start preview
  const firstRide = itin.legs.find((l): l is RideLeg => l.kind === "ride");
  return (
    <h1 className={base}>
      {t("ml.hl.doorToDoor")}{" "}
      <span className="text-aegean-deep">{Math.round(itin.totalDurationSec / 60)}</span>
      <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">
        {t("common.minUnit")}
      </span>
      <br />
      <span className="italic text-olive-soft">
        {t("ml.hl.startingOn", { code: firstRide?.routeShort ?? "" })}
      </span>
    </h1>
  );
}

export function PhaseSub({
  live,
  itin,
  destLabel,
  dest,
}: {
  live: MultiLegLive;
  itin: Itinerary;
  destLabel: string;
  dest?: { lat: number; lng: number };
}) {
  const { t } = useI18n();
  const changesLabel =
    itin.transfers === 1 ? t("ml.changesOne") : t("ml.changesN", { n: itin.transfers });
  const text =
    live.phase === "idle"
      ? t("ml.sub.idle", { changes: changesLabel })
      : live.phase === "walking-to-board"
        ? t("ml.sub.walkBoard")
        : live.phase === "waiting-to-board"
          ? t("ml.sub.waitBoard")
          : live.phase === "riding"
            ? live.nextRideLeg
              ? t("ml.sub.ridingChange", {
                  code: live.nextRideLeg.routeShort,
                  name: live.currentRideLeg?.alight.name ?? "",
                })
              : t("ml.sub.ridingSit")
            : live.phase === "alight-soon"
              ? live.nextRideLeg
                ? t("ml.sub.alightChange", {
                    name: live.nextRideLeg.board.name,
                    code: live.nextRideLeg.routeShort,
                  })
                : t("ml.sub.alightFinal", { name: destLabel })
              : live.phase === "walking-to-transfer"
                ? live.nextRideLeg
                  ? t("ml.sub.walkTransfer", {
                      code: live.nextRideLeg.routeShort,
                      min: fmtMin(live.secsToNextBoard),
                    })
                  : t("ml.sub.walkTransferNo")
                : live.phase === "waiting-for-connection"
                  ? live.nextBoardLate
                    ? t("ml.sub.waitConnLate", {
                        m: Math.round(
                          (live.secsToNextBoard -
                            (live.nextRideLeg?.board.departureUnix ?? 0) +
                            Math.floor(Date.now() / 1000)) /
                            60,
                        ),
                      })
                    : t("ml.sub.waitConn")
                  : live.phase === "walking-to-destination"
                    ? t("ml.sub.finalWalk", {
                        m: Math.max(
                          0,
                          Math.round(
                            (live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) /
                              60,
                          ),
                        ),
                        name: destLabel,
                      })
                    : t("ml.sub.welcome", { name: destLabel });
  const raw = destBailFromLive(live, destLabel, dest);
  const ride = live.currentRideLeg;
  const keep = raw?.kind === "keepWait" ? raw : null;
  const hint = useHeadwayHint({
    routeId: keep && ride ? ride.routeId : null,
    stopId: keep && ride ? ride.board.stopId : null,
    arrivalUnix: keep ? Math.floor(Date.now() / 1000) + live.secsToCurrentBoard : null,
  });
  
  const upgraded = useBailUpgrade(live, raw, dest);
  const bail = destBailWithHeadway(upgraded, hint);

  return (
    <>
      <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-soft leading-relaxed">
        <IconClock className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
        <span>{text}</span>
      </p>
      {bail && <DestBailLine action={bail} t={t} />}
    </>
  );
}

function destBailFromLive(
  live: MultiLegLive,
  destLabel: string,
  dest?: { lat: number; lng: number },
): DestBail | null {
  const ride = live.currentRideLeg;
  if (!ride) return null;
  const phase =
    live.phase === "waiting-to-board"
      ? "waiting"
      : live.phase === "walking-to-board"
        ? "walking"
        : "other";
  const from = live.fix ?? { lat: ride.board.lat, lng: ride.board.lng };
  return destBailForWait({
    dark: live.tripGhost,
    phase,
    waitMin: live.secsToCurrentBoard / 60,
    from,
    to: dest ?? null,
    destLabel,
    routeShort: ride.routeShort,
  });
}
