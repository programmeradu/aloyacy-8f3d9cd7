// Premium departure row used on the Stop detail page.
//
// Single source of truth for every signal:
//   - one tier chip (never repeated as a blurb)
//   - one ETA number with one unit label
//   - one schedule clock-time
//   - the band only when materially wider than ±1 min and not scheduled
//   - the operator strikethrough only when a live/predicted/rider ETA disagrees
//
// Designed to feel bespoke against the limestone surface — generous gutters,
// display numerals on a hairline rule, monospaced micro-meta.

import { Link } from "@tanstack/react-router";
import { RouteChip } from "@/components/RouteChip";
import { routeTone } from "@/lib/gtfs";
import {
  confidenceDot,
  tierAccent,
  type FreshnessTier,
  type FreshnessConfidence,
} from "@/lib/freshness";
import { useI18n, type DictKey } from "@/lib/i18n";

type DepartureRowProps = {
  tripId: string;
  routeId: string;
  routeShort: string;
  routeLong: string;
  stopId: string;
  arrivalUnix: number;
  eta: {
    etaMin: number | null;
    band?: string;
    tier: FreshnessTier;
    confidence: FreshnessConfidence;
    operatorEtaMin?: number;
  };
};

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

export function DepartureRow({
  tripId,
  routeId,
  routeShort,
  routeLong,
  stopId,
  arrivalUnix,
  eta,
}: DepartureRowProps) {
  const { t } = useI18n();
  const accent = tierAccent(eta.tier);
  const dot = confidenceDot(eta.confidence);
  const tierLabel = t(TIER_KEYS[eta.tier]);
  const isLiveish = eta.tier === "live" || eta.tier === "rider-confirmed" || eta.tier === "predicted";

  const shifted =
    isLiveish &&
    eta.etaMin != null &&
    eta.operatorEtaMin != null &&
    eta.operatorEtaMin !== eta.etaMin;

  const showBand =
    eta.tier !== "ghost" &&
    eta.tier !== "scheduled" &&
    !!eta.band &&
    bandIsInformative(eta.band, eta.etaMin);

  const clock = formatClock(arrivalUnix);

  // Split a typical Cyprus long-name "A — B" into origin / destination so the
  // headline reads as a directional journey instead of a label.
  const [origin, destination] = splitLongName(routeLong);

  return (
    <Link
      to="/trip-info/$tripId"
      params={{ tripId }}
      search={{ from: stopId }}
      className="group relative block rounded-3xl bg-card ring-1 ring-line p-5 transition-all hover:ring-aegean-deep/30 hover:-translate-y-[1px]"
    >
      {/* Top row: route chip + journey title + ETA numeral */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4">
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <RouteChip code={routeShort} tone={routeTone(routeId)} />
          <span className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-ink-soft/60">
            {t("stop.routeKicker")}
          </span>
        </div>

        <div className="min-w-0">
          <p className="font-display text-[19px] leading-[1.15] text-ink text-pretty">
            <span className="truncate">{origin}</span>
            {destination && (
              <>
                <span className="mx-1.5 text-ink-soft/40 font-sans">→</span>
                <span className="text-ink-soft">{destination}</span>
              </>
            )}
          </p>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {t("stop.scheduledAt", { time: clock })}
          </p>
        </div>

        <div className="flex flex-col items-end text-right shrink-0">
          <span className={`font-display text-[44px] leading-none tracking-tight ${accent}`}>
            {eta.etaMin ?? "—"}
          </span>
          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft/70">
            {eta.etaMin != null ? t("eta.minLabel") : t("eta.tier.ghost")}
          </span>
        </div>
      </div>

      {/* Hairline + single meta strip — one place for tier, band, op-shift */}
      <div className="mt-4 pt-3 border-t border-line/70 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft min-w-0">
          <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
          <span className={accent}>{tierLabel}</span>
          {isLiveish && (
            <>
              <span className="text-ink-soft/30">·</span>
              <span className="text-ink-soft/70 truncate">{t(CONFIDENCE_KEYS[eta.confidence])}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/70 shrink-0">
          {showBand && <span>{eta.band}</span>}
          {shifted && (
            <span className="line-through decoration-1 text-ink-soft/50">
              {t("eta.opShort", { m: eta.operatorEtaMin! })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

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

function formatClock(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function splitLongName(long: string): [string, string | null] {
  if (!long) return ["", null];
  // Cyprus GTFS uses " - " or " — " between origin and destination.
  const parts = long.split(/\s+[—-]\s+/);
  if (parts.length >= 2) {
    return [parts[0].trim(), parts.slice(1).join(" — ").trim()];
  }
  return [long, null];
}
