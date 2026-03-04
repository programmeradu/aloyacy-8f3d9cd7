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
  high: { dot: "bg-olive", text: "text-olive-deep", ring: "ring-olive/30" },
  medium: { dot: "bg-ochre", text: "text-ochre-deep", ring: "ring-ochre/30" },
  low: { dot: "bg-clay", text: "text-clay-deep", ring: "ring-clay/30" },
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
    return (
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
          {t("reliability.label")}
        </span>
        <span className={`font-display text-[28px] leading-none ${tone.text}`}>
          {isRated ? `${onTimePct}%` : "—"}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/80">
          {subline}
          {sampleLine ? ` · ${sampleLine}` : ""}
        </span>
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
