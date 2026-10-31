import { useEffect, useState } from "react";
import { IconBus } from "@/components/Icons";
import { confirmOnBoard, markMissed, type LiveJourney } from "@/lib/useJourney";
import { useI18n } from "@/lib/i18n";
import type { ActiveTrip } from "@/lib/trip-store";

export function BoardingPrompt({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
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
        <p className="text-[12px] text-aegean-deep">
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
