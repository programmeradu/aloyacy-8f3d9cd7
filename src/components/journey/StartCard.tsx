import liveGuidanceImg from "@/assets/live-guidance.jpg";
import { IconArrowUpRight } from "@/components/Icons";
import { startLiveTracking } from "@/lib/useJourney";
import { requestCompassPermission } from "@/lib/useCompass";
import type { ActiveTrip } from "@/lib/trip-store";
import { useI18n } from "@/lib/i18n";

export function StartCard({ trip }: { trip: ActiveTrip }) {
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
            type="button"
            onClick={() => {
              // Flip into live mode first — compass is an enhancement,
              // never a gate. If the iOS permission dialog stalls or the
              // rider dismisses it, guidance still starts.
              startLiveTracking();
              void requestCompassPermission().catch(() => {});
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-sans text-[14px] font-semibold tracking-tight text-limestone active:scale-[0.98] transition"
          >
            {t("hud.startCta")}
            <IconArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
