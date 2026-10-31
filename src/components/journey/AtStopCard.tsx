import { SightingButton } from "@/components/SightingButton";
import { getStop } from "@/lib/gtfs";
import { fmtEta as fmtMinutes } from "@/lib/journey-copy";
import { useI18n } from "@/lib/i18n";
import { useSparseSeedIds } from "@/lib/useSparseSeeds";
import type { ActiveTrip } from "@/lib/trip-store";
import type { LiveJourney } from "@/lib/useJourney";

export function AtStopCard({ trip, live }: { trip: ActiveTrip; live: LiveJourney }) {
  const { t } = useI18n();
  const seeds = useSparseSeedIds();
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  const needsSighting = live.tripGhost || live.vehicleNotTracked || live.feedStale;
  return (
    <section className="px-6 animate-rise space-y-3">
      <div className="rounded-[28px] bg-olive-soft/40 ring-1 ring-olive/25 p-5">
        <p className="text-[12px] text-olive">
          {t("hud.atStop.label")}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.atStop.headline", { code: bus.routeShort, min: fmtMinutes(live.secsToBoard) })}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {t("hud.atStop.body", { name: bus.board.name })}
        </p>
      </div>
      {needsSighting &&
        (() => {
          const s = getStop(bus.board.stopId);
          if (!s) return null;
          return (
            <SightingButton
              tripId={bus.tripId}
              routeId={bus.routeId}
              stopId={bus.board.stopId}
              lat={s.lat}
              lng={s.lng}
              needEyes={seeds.has(bus.routeId)}
            />
          );
        })()}
    </section>
  );
}
