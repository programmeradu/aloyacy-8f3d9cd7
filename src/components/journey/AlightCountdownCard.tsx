// The on-board alighting card.
//
// It replaces a single "press the button" alert fired off a 60-second ETA —
// which routinely went off five stops early — with a live board the rider can
// actually read against the window: where the bus is standing right now, every
// stop still to come, and a staged instruction that only says "press" once the
// bus has pulled away from the stop before theirs.
//
// Presentation notes: stop names wrap rather than truncate (Cypriot stop names
// run long, and the name is the whole point of the card), the remaining list
// scrolls internally past six entries so the card never pushes the map off
// screen, and the current stop is marked with a rule and a numeral instead of
// a dot.

import type { AlightCountdown, AlightStage } from "@aloya/core/alight-countdown";
import type { LiveJourney } from "@/lib/useJourney";
import type { ActiveTrip } from "@/lib/trip-store";
import { markAlighted } from "@/lib/useJourney";
import { useI18n } from "@/lib/i18n";

type T = ReturnType<typeof useI18n>["t"];
import { fmtEta as fmtMinutes } from "@/lib/journey-copy";
import { IconClock, IconPin } from "@/components/Icons";

/** Stage → accent, from calm aegean through to an urgent ochre. */
const ACCENT: Record<AlightStage, string> = {
  cruising: "text-aegean-deep",
  "get-ready": "text-aegean-deep",
  "stand-by": "text-ochre",
  "press-now": "text-ochre",
  alighting: "text-ochre",
  passed: "text-ink-soft",
};

const URGENT: AlightStage[] = ["press-now", "alighting"];

function kickerFor(cd: AlightCountdown, t: T) {
  const n = cd.stopsRemaining;
  switch (cd.stage) {
    case "stand-by":
      return t("hud.alight.standby");
    case "press-now":
      return t("hud.alight.press");
    case "alighting":
      return t("hud.alight.alighting");
    case "passed":
      return t("hud.alight.passed");
    default:
      if (n == null) return t("hud.alight.final");
      return n === 1 ? t("hud.alight.one") : t("hud.alight.ready", { n });
  }
}

function bodyFor(
  cd: AlightCountdown,
  alightName: string,
  t: T,
) {
  switch (cd.stage) {
    case "stand-by":
      return t("hud.alight.bodyStandby");
    case "press-now":
      return t("hud.alight.bodyPress", { name: alightName });
    case "alighting":
      return t("hud.alight.bodyAlighting", { name: alightName });
    case "passed":
      return t("hud.alight.bodyPassed");
    default:
      return t("hud.alight.bodyReady");
  }
}

export function AlightCountdownCard({
  trip,
  live,
}: {
  trip: ActiveTrip;
  live: LiveJourney;
}) {
  const { t } = useI18n();
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;

  const cd = live.alight;
  const urgent = URGENT.includes(cd.stage);
  const eta = live.fusedSecsToAlight > 0 ? live.fusedSecsToAlight : live.secsToAlight;
  const alightName = cd.alightStop?.name ?? bus.alight.name;

  // Where the bus physically is, phrased the way a rider would check it.
  const positionLine = cd.currentStop
    ? cd.atStop
      ? t("hud.alight.atStop", { name: cd.currentStop.name })
      : t("hud.alight.approaching", { name: cd.currentStop.name })
    : cd.nextStop
      ? t("hud.alight.approaching", { name: cd.nextStop.name })
      : null;

  return (
    <section className="px-6 animate-rise">
      <div
        className={`rounded-[28px] p-5 ring-1 ${
          urgent ? "bg-ochre/12 ring-ochre/40" : "bg-card ring-line"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={`font-mono text-[10px] uppercase tracking-[0.22em] ${
              urgent ? "text-ochre" : "text-aegean-deep"
            }`}
          >
            {t("hud.riding.label", { code: bus.routeShort })}
          </p>
          {eta > 0 && (
            <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {fmtMinutes(eta)}
            </p>
          )}
        </div>

        <p
          className={`mt-2 font-display text-[26px] leading-tight ${
            urgent ? "text-ink" : "text-ink"
          }`}
        >
          {kickerFor(cd, t)}
        </p>
        <p className="mt-1 break-words font-display text-[17px] leading-snug text-ink-soft">
          {alightName}
        </p>

        <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
          <IconClock className={`mt-0.5 size-3.5 shrink-0 ${ACCENT[cd.stage]}`} />
          <span className="min-w-0 break-words">{bodyFor(cd, alightName, t)}</span>
        </p>

        {positionLine && (
          <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink">
            <span className="min-w-0 break-words">{positionLine}</span>
          </p>
        )}

        {live.vehicleLost && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
            {t("hud.riding.lost")}
          </p>
        )}

        {cd.upcoming.length > 0 && (
          <div className="mt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("hud.alight.remaining")}
            </p>
            <ol
              className={`mt-2 space-y-0 ${
                cd.upcoming.length > 6 ? "max-h-[13.5rem] overflow-y-auto pr-1" : ""
              }`}
            >
              {cd.upcoming.map((s, i) => {
                const isTarget = i === cd.upcoming.length - 1;
                const isHere = s.stopsAway === 0 && cd.atStop;
                return (
                  <li
                    key={`${s.stopId}-${i}`}
                    className={`flex items-start gap-3 border-t border-line py-2 first:border-t-0 ${
                      isHere ? "opacity-100" : "opacity-90"
                    }`}
                  >
                    <span
                      className={`mt-[3px] w-6 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                        isTarget ? "text-ochre" : "text-ink-soft"
                      }`}
                    >
                      {s.stopsAway}
                    </span>
                    <span
                      className={`min-w-0 break-words text-[14px] leading-snug ${
                        isTarget ? "font-semibold text-ink" : "text-ink-soft"
                      }`}
                    >
                      {s.name}
                      {isTarget && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ochre">
                          {t("hud.alight.yourStop")}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {!cd.hasSequence && (
          <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
            {t("hud.alight.noSequence")}
          </p>
        )}

        {(cd.stage === "press-now" || cd.stage === "alighting" || cd.stage === "passed") && (
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
