import type { LiveJourney } from "@/lib/useJourney";
import { fmtEta as fmtMinutes } from "@/lib/journey-copy";
import { useI18n } from "@/lib/i18n";

export function HurryBanner({ urgent, live }: { urgent: boolean; live: LiveJourney }) {
  const { t } = useI18n();
  return (
    <section className="px-6 animate-rise">
      <div
        className={`rounded-[28px] p-5 ring-1 ${
          urgent ? "bg-ochre-soft ring-ochre/40" : "bg-ochre-soft/50 ring-ochre/25"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
            {urgent ? t("hud.hurry.urgentTitle") : t("hud.hurry.softTitle")}
          </p>
          {urgent && (
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ochre opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-ochre" />
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-[26px] leading-tight text-ink">
          {t("hud.hurry.headline", {
            board: fmtMinutes(live.secsToBoard),
            walk: fmtMinutes(live.walkingEtaSec),
          })}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {urgent ? t("hud.hurry.urgentBody") : t("hud.hurry.softBody")}
        </p>
      </div>
    </section>
  );
}
