import type { LiveJourney } from "@/lib/useJourney";
import type { WalkStep } from "@/lib/geo";
import { fmtEta as fmtMinutes } from "@/lib/journey-copy";
import { useI18n } from "@/lib/i18n";

function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function LiveStepCard({ live, steps }: { live: LiveJourney; steps: WalkStep[] }) {
  const { t } = useI18n();
  const idx = Math.min(live.currentStepIndex, steps.length - 1);
  const step = steps[idx];
  const next = steps[idx + 1];
  const isFinal = idx === steps.length - 1;

  return (
    <section className="px-6 animate-rise">
      <article className="rounded-[28px] bg-card ring-1 ring-line p-5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-aegean-deep">
            {live.phase === "walking-to-dest" ? t("hud.walking.toDest") : t("hud.walking.toStop")}
          </p>
          <p className="text-[12px] text-ink-soft">
            {fmtMeters(live.metersToDestination)}, {fmtMinutes(live.walkingEtaSec)}
          </p>
        </div>

        <p className="mt-3 font-display text-[32px] leading-[1.05] text-ink text-balance">
          {step.instruction}
        </p>
        <p className="mt-2 text-[12px] text-ink-soft">
          {fmtMeters(live.metersToStepEnd)}, {(step.maneuver || "straight").replace(/-/g, " ")}
        </p>

        {next && !isFinal && (
          <div className="mt-4 border-t border-line/70 pt-3">
            <p className="text-[12px] text-ink-soft">
              {t("hud.walking.then")}
            </p>
            <p className="mt-1 font-display text-[15px] leading-snug text-ink-soft">
              {next.instruction}
            </p>
          </div>
        )}
      </article>
    </section>
  );
}
