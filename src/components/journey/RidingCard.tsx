import { IconClock, IconPin } from "@/components/Icons";
import { markAlighted, type LiveJourney } from "@/lib/useJourney";
import { fmtEta as fmtMinutes } from "@/lib/journey-copy";
import { useI18n } from "@/lib/i18n";
import type { ActiveTrip } from "@/lib/trip-store";

export function RidingCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const { t } = useI18n();
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  const eta = live.fusedSecsToAlight > 0 ? live.fusedSecsToAlight : live.secsToAlight;
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
        <p className="text-[12px] text-aegean-deep">
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
