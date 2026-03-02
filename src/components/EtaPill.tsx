// Canonical ETA display. One component, every surface, so the rider's
// confidence story is identical across StopCard, stop detail, Journey HUD,
// multi-leg companion, commute card, and Pulse.
//
// Composition:
//   ┌───────────┐  ┌──────────────────────────────────────────┐
//   │   4 min   │  │ · live   high confidence                 │
//   └───────────┘  │   8–12 min                                │
//                  └──────────────────────────────────────────┘
//
// Variants:
//   "headline"   large numeric (stop detail, hero)
//   "compact"    inline pill (lists, multi-leg leg cards)
//   "stack"      number stacked above chip (StopCard right column)
//
// Edge cases handled in first pass:
//   - empty / ghost   → headline shows "—" with "NO GPS" chip; never blank
//   - very long route names handled by callers (we never receive them here)
//   - operator strikethrough renders below band so the column never clips
//   - long band labels wrap, they don't truncate (band carries critical info)

import { useI18n, type DictKey } from "@/lib/i18n";
import {
  confidenceDot,
  tierAccent,
  type FreshnessTier,
  type FreshnessConfidence,
} from "@/lib/freshness";

export type EtaPillData = {
  /** Median ETA, in minutes. null when ghost / scheduled with no number. */
  etaMin: number | null;
  /** Lower–upper band label e.g. "8–12 min" or "≈10 min". Optional. */
  band?: string;
  tier: FreshnessTier;
  confidence: FreshnessConfidence;
  /** Operator's published number — rendered struck-through when it disagrees. */
  operatorEtaMin?: number;
  /** Short freshness chip text (stable english token mapped via i18n). */
  token?: string;
  /** Free-form short blurb e.g. "usually 2 min late". Optional. */
  blurb?: string;
};

type Variant = "headline" | "compact" | "stack";

const TIER_KEYS: Record<FreshnessTier, DictKey> = {
  live: "eta.tier.live",
  "rider-confirmed": "eta.tier.rider",
  predicted: "eta.tier.predicted",
  ghost: "eta.tier.ghost",
  scheduled: "eta.tier.scheduled",
};

const CONFIDENCE_KEYS: Record<FreshnessConfidence, DictKey> = {
  high: "eta.conf.high",
  medium: "eta.conf.med",
  low: "eta.conf.low",
};

export function EtaPill({
  data,
  variant = "stack",
  align = "right",
}: {
  data: EtaPillData;
  variant?: Variant;
  align?: "left" | "right";
}) {
  const { t } = useI18n();
  const isGhost = data.tier === "ghost";
  const accent = tierAccent(data.tier);
  const dot = confidenceDot(data.confidence);
  const tierLabel = t(TIER_KEYS[data.tier]);
  const confLabel = t(CONFIDENCE_KEYS[data.confidence]);
  const shifted =
    data.etaMin != null &&
    data.operatorEtaMin != null &&
    data.operatorEtaMin !== data.etaMin;
  const showBand =
    !isGhost && data.band && bandIsInformative(data.band, data.etaMin);

  // Headline variant — used at the top of stop detail or hero cards.
  if (variant === "headline") {
    return (
      <div
        className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
      >
        <div className="flex items-baseline gap-2">
          <span className={`font-display text-6xl leading-none ${accent}`}>
            {data.etaMin ?? "—"}
          </span>
          {data.etaMin != null && (
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("eta.minLabel")}
            </span>
          )}
        </div>
        <ChipRow
          dot={dot}
          tierLabel={tierLabel}
          confLabel={confLabel}
          tier={data.tier}
        />
        {showBand && (
          <p className="mt-1 font-mono text-[11px] tracking-[0.04em] text-ink-soft">
            {data.band}
          </p>
        )}
        {shifted && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70 line-through decoration-1">
            {t("eta.opShort", { m: data.operatorEtaMin! })}
          </p>
        )}
        {data.blurb && (
          <p className="mt-1 text-[11.5px] text-ink-soft max-w-[14rem]">
            {data.blurb}
          </p>
        )}
      </div>
    );
  }

  // Compact pill — fits in dense lists & leg cards.
  if (variant === "compact") {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full bg-limestone-soft/70 ring-1 ring-line px-3 py-1`}
      >
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
        <span className={`font-display text-[15px] leading-none ${accent}`}>
          {data.etaMin ?? "—"}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          {data.etaMin != null ? t("eta.minLabel") : t("eta.tier.ghost")}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft/80">
          · {tierLabel}
        </span>
      </span>
    );
  }

  // Stack variant — used in StopCard right column and similar.
  return (
    <div
      className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
    >
      <span className={`font-display text-5xl leading-none ${accent}`}>
        {data.etaMin ?? "—"}
      </span>
      <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft/80">
        {data.etaMin != null ? t("eta.minLabel") : t("eta.tier.ghost")}
      </span>
      <ChipRow
        dot={dot}
        tierLabel={tierLabel}
        confLabel={confLabel}
        tier={data.tier}
        compact
      />
      {showBand && (
        <p className="mt-1 font-mono text-[10px] tracking-[0.04em] text-ink-soft/80">
          {data.band}
        </p>
      )}
      {shifted && (
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft/60 line-through decoration-1">
          {t("eta.opShort", { m: data.operatorEtaMin! })}
        </p>
      )}
    </div>
  );
}

function ChipRow({
  dot,
  tierLabel,
  confLabel,
  tier,
  compact = false,
}: {
  dot: string;
  tierLabel: string;
  confLabel: string;
  tier: FreshnessTier;
  compact?: boolean;
}) {
  // Confidence is hidden when ghost/scheduled — it would mislead.
  const showConfidence = tier === "live" || tier === "rider-confirmed" || tier === "predicted";
  const size = compact ? "text-[9px]" : "text-[10px]";
  return (
    <div className={`mt-1 flex items-center gap-1.5 font-mono uppercase tracking-[0.18em] ${size} text-ink-soft`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      <span>{tierLabel}</span>
      {showConfidence && (
        <>
          <span className="text-ink-soft/40">·</span>
          <span>{confLabel}</span>
        </>
      )}
    </div>
  );
}

/** Only show the band when it materially differs from the headline minute. */
function bandIsInformative(band: string, headlineMin: number | null): boolean {
  if (!band.includes("–")) return false;
  const m = band.match(/^(\d+)\s*–\s*(\d+)/);
  if (!m) return true;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (hi - lo <= 1) return false;
  if (headlineMin != null && Math.abs(lo - headlineMin) <= 1 && Math.abs(hi - headlineMin) <= 1) return false;
  return true;
}
