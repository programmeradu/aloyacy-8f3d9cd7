import { useI18n } from "@/lib/i18n";
import type { ReliabilityTier } from "@/lib/reliability.functions";

type Props = {
  tier: ReliabilityTier;
  onTimePct: number;
  meanDelaySec: number;
  sampleCount: number;
  /** Compact = inline pill. Stack = label above number, for hero placement. */
  variant?: "compact" | "stack";
};

const TIER_TONE: Record<ReliabilityTier, { dot: string; text: string; ring: string }> = {
  high: { dot: "bg-olive", text: "text-olive", ring: "ring-olive/30" },
  medium: { dot: "bg-ochre", text: "text-ink", ring: "ring-ochre/40" },
  low: { dot: "bg-destructive", text: "text-destructive", ring: "ring-destructive/30" },
  unknown: { dot: "bg-ink-soft/40", text: "text-ink-soft", ring: "ring-line" },
};

export function ReliabilityBadge({
  tier,
  onTimePct,
  meanDelaySec,
  sampleCount,
  variant = "compact",
}: Props) {
  const { t } = useI18n();
  const tone = TIER_TONE[tier];
  const isRated = tier !== "unknown";

  const headline = isRated
    ? t("reliability.headline", { pct: onTimePct })
    : t("reliability.notEnough");

  const subline = isRated
    ? meanDelaySec >= 30
      ? t("reliability.subAvgLate", { sec: Math.round(meanDelaySec) })
      : meanDelaySec <= -30
        ? t("reliability.subAvgEarly", { sec: Math.round(Math.abs(meanDelaySec)) })
        : t("reliability.subAvgOnTime")
    : t("reliability.subLearning");

  const sampleLine = isRated ? t("reliability.samples", { n: sampleCount }) : null;

  if (variant === "stack") {
    const late = meanDelaySec > 0;
    const summary = !isRated
      ? t("reliability.summaryLearning")
      : Math.abs(meanDelaySec) < 60
        ? t("reliability.summaryOnTime")
        : late
          ? meanDelaySec < 180
            ? t("reliability.summaryLateSmall")
            : t("reliability.summaryLateBig")
          : Math.abs(meanDelaySec) < 180
            ? t("reliability.summaryEarlySmall")
            : t("reliability.summaryEarlyBig");
    const hint = !isRated
      ? t("reliability.hintLearning")
      : tier === "high"
        ? t("reliability.hintHigh")
        : tier === "medium"
          ? t("reliability.hintMedium")
          : t("reliability.hintLow");

    return (
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
          {t("reliability.label")}
        </span>
        <span className={`font-display text-[28px] leading-none ${tone.text}`}>
          {isRated ? `${onTimePct}%` : "—"}
          {isRated && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/80 align-middle">
              {t("reliability.onTime")}
            </span>
          )}
        </span>
        <span className="text-[13px] text-ink leading-snug">{summary}</span>
        <span className="text-[11.5px] text-ink-soft leading-snug">{hint}</span>
      </div>
    );
  }


  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 ring-1 ${tone.ring}`}
      title={`${headline} — ${subline}${sampleLine ? ` (${sampleLine})` : ""}`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
      <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${tone.text}`}>
        {headline}
      </span>
    </span>
  );
}
