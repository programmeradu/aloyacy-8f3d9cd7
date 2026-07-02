import { paywallStore } from "@/lib/paywall-store";
import { useProSubscription } from "@/lib/usePro";
import { useTrialEligibility } from "@/lib/useTrialEligibility";
import { useI18n } from "@/lib/i18n";

/**
 * Aloya Pro upsell — compact editorial card.
 */
export function ProUpsellCard() {
  const { isPro, loading } = useProSubscription();
  const trialEligible = useTrialEligibility();
  const { t } = useI18n();

  if (loading || isPro) return null;

  return (
    <article className="relative overflow-hidden rounded-2xl bg-ink text-limestone ring-1 ring-ink/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--color-aegean) 22%, transparent) 0%, transparent 55%), radial-gradient(80% 60% at 0% 120%, color-mix(in oklab, var(--color-ochre) 14%, transparent) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-limestone/30 to-transparent"
      />

      <div className="relative flex items-center gap-4 px-4 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-display text-[11px] font-medium leading-none tracking-[0.14em] text-limestone/70">
            Aloya<span className="text-ochre"> Pro</span>
            {trialEligible && (
              <span className="ml-2 rounded-full bg-ochre/15 px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.16em] text-ochre">
                7 DAYS FREE
              </span>
            )}
          </p>
          <p className="mt-1.5 font-display text-[17px] leading-[1.15] tracking-tight text-limestone text-balance">
            {t("proup.taglineLead")}{" "}
            <span className="text-limestone/55">{t("proup.taglineTail")}</span>
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-limestone/55">
            {trialEligible ? (
              <>
                7-day free trial, then{" "}
                <span className="tabular-nums text-limestone/80">€1.99</span>
                /wk · cancel anytime
              </>
            ) : (
              <>
                {t("proup.priceFromPrefix")}{" "}
                <span className="tabular-nums text-limestone/80">€1.99</span>
                {t("proup.priceFromSuffix")}
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => paywallStore.open()}
          className="shrink-0 rounded-full bg-limestone px-4 py-2 text-[12.5px] font-medium tracking-tight text-ink transition hover:bg-limestone/90 active:scale-[0.98]"
        >
          {trialEligible ? "Start free" : t("proup.tryPro")}
        </button>
      </div>
    </article>
  );
}

export function GoProInline({ label }: { label?: string }) {
  const { isPro } = useProSubscription();
  const { t } = useI18n();
  if (isPro) return null;
  return (
    <button
      onClick={() => paywallStore.open()}
      className="inline-flex items-center gap-2 rounded-full bg-ochre-soft/70 px-3 py-1.5 text-[11px] font-medium tracking-tight text-ochre ring-1 ring-ochre/40"
    >
      <span>{label ?? t("proup.unlock")}</span>
    </button>
  );
}
