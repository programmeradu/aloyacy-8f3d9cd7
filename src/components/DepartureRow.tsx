// Premium departure row used on the Stop detail page.
//
// Single source of truth for every signal:
//   - one tier chip (never repeated as a blurb)
//   - one ETA number with one unit label
//   - one schedule clock-time
//   - the band only when materially wider than ±1 min and not scheduled
//   - the operator strikethrough only when a live/predicted/rider ETA disagrees
//
// Apple-grade layout: responsive grid that holds together from 320px up,
// generous gutters, monospaced micro-meta, and a soft editorial accent
// image bled into the right edge at low opacity — readable on every label.

import { Link } from "@tanstack/react-router";
import { RouteChip } from "@/components/RouteChip";
import { routeTone } from "@/lib/gtfs";
import { tierAccent, type FreshnessTier, type FreshnessConfidence } from "@/lib/freshness";
import { useI18n, type DictKey } from "@/lib/i18n";
import { ConfidenceIcon } from "@/components/ConfidenceIcon";
import accentAsset from "@/assets/route-card-accent.jpg.asset.json";
import { cyClock } from "@aloya/core/cy-time";
import type { HeadwayHint, HeadwayWhen } from "@aloya/core/headway-chance";
import type { WaitOrBail } from "@aloya/core/wait-or-bail";
import { boardingPayKind, type BoardingPayKind } from "@aloya/core/boarding-pay";

type DepartureRowProps = {
  tripId: string;
  routeId: string;
  routeShort: string;
  routeLong: string;
  /** Trip-level headsign from GTFS trips.txt, when available. Preferred over
   *  parsing the route long name — disambiguates opposite directions of the
   *  same route (e.g. "19 → Lakatamia" vs "19 → City Center"). */
  headsign?: string | null;
  stopId: string;
  arrivalUnix: number;
  eta: {
    etaMin: number | null;
    band?: string;
    tier: FreshnessTier;
    confidence: FreshnessConfidence;
    operatorEtaMin?: number;
    pingAgeSec?: number;
    singleSource?: boolean;
  };
  noShow?: { missed: number; days: number; weekend: boolean } | null;
  lastTonight?: boolean;
  headway?: HeadwayHint | null;
  waitOrBail?: WaitOrBail | null;
  agency?: string;
  feedId?: number;
};

const TIER_KEYS: Record<FreshnessTier, DictKey> = {
  live: "eta.tier.live",
  "rider-confirmed": "eta.tier.rider",
  predicted: "eta.tier.predicted",
  ghost: "eta.tier.ghost",
  scheduled: "eta.tier.scheduled",
};

const HEADWAY_WHEN: Record<HeadwayWhen, DictKey> = {
  weekdayMorning: "stop.headway.weekdayMorning",
  weekdayAfternoon: "stop.headway.weekdayAfternoon",
  weekdayEvening: "stop.headway.weekdayEvening",
  weekdayNight: "stop.headway.weekdayNight",
  weekendMorning: "stop.headway.weekendMorning",
  weekendAfternoon: "stop.headway.weekendAfternoon",
  weekendEvening: "stop.headway.weekendEvening",
  weekendNight: "stop.headway.weekendNight",
};

export function DepartureRow({
  tripId,
  routeId,
  routeShort,
  routeLong,
  headsign,
  stopId,
  arrivalUnix,
  eta,
  noShow,
  lastTonight,
  headway,
  waitOrBail,
  agency,
  feedId,
}: DepartureRowProps) {
  const { t } = useI18n();
  const accent = tierAccent(eta.tier);
  const tierLabel = t(
    eta.tier === "rider-confirmed" && eta.singleSource ? "eta.tier.riderOne" : TIER_KEYS[eta.tier],
  );

  const isLiveish =
    eta.tier === "live" || eta.tier === "rider-confirmed" || eta.tier === "predicted";

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
  // Trip headsign is the truth source; fall back to parsing route long name.
  const fallback = splitLongName(routeLong);
  const origin = fallback[0];
  const destination = (headsign && headsign.trim()) || fallback[1];
  const payKind = boardingPayKind({ agency, feedId, short: routeShort });

  return (
    <Link
      to="/trip-info/$tripId"
      params={{ tripId }}
      search={{ from: stopId }}
      className="group relative block overflow-hidden rounded-3xl bg-card ring-1 ring-line transition-all hover:ring-aegean-deep/30 hover:-translate-y-[1px]"
    >
      {/* Editorial accent — sits behind content on the right, kept faint so
          no text loses contrast. Hidden on the tightest widths. */}
      <img
        src={accentAsset.url}
        alt=""
        aria-hidden
        loading="lazy"
        width={1024}
        height={512}
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[62%] object-cover object-right opacity-[0.32] sm:opacity-[0.38] mix-blend-multiply"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/80 to-transparent" />

      <div className="relative p-4 sm:p-5">
        {/* Top row: route chip · journey title · ETA numeral */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <RouteChip code={routeShort} tone={routeTone(routeId)} />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-ink-soft/70">
              {t("stop.routeKicker")}
            </span>
          </div>

          <div className="min-w-0">
            {destination ? (
              <>
                <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-aegean-deep/80 truncate">
                  {t("stop.headedTo")}
                </p>
                <h3 className="mt-0.5 font-display text-[17px] sm:text-[20px] leading-[1.15] tracking-tight text-ink text-pretty line-clamp-2">
                  {destination}
                </h3>
              </>
            ) : (
              <h3 className="font-display text-[17px] sm:text-[20px] leading-[1.15] tracking-tight text-ink text-pretty line-clamp-2">
                {origin}
              </h3>
            )}
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {t("stop.scheduledAt", { time: clock })}
            </p>
            {payKind && <PayLine kind={payKind} t={t} />}
            {waitOrBail && <WaitOrBailLine action={waitOrBail} t={t} />}
            {eta.tier === "rider-confirmed" &&
              eta.pingAgeSec != null &&
              Number.isFinite(eta.pingAgeSec) && (
                <p className="mt-2 text-[13px] leading-snug text-ink">
                  {t("stop.riderChain", { n: Math.round(eta.pingAgeSec) })}
                </p>
              )}
            {lastTonight && waitOrBail?.kind !== "bail" && (
              <p className="mt-2 text-[13px] leading-snug text-ink">
                {t("stop.lastTonight", { route: routeShort })}
              </p>
            )}
            {noShow && (
              <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
                {t(noShow.weekend ? "stop.noShowWeekend" : "stop.noShowWeekday", {
                  time: clock,
                  missed: noShow.missed,
                  days: noShow.days,
                })}
              </p>
            )}
            {headway && !waitOrBail && (
              <HeadwayLines hint={headway} routeShort={routeShort} t={t} />
            )}
          </div>

          <div className="flex flex-col items-end text-right shrink-0 pl-1">
            <span
              className={`font-display text-[36px] sm:text-[44px] leading-none tracking-tight tabular-nums ${accent}`}
            >
              {eta.etaMin ?? "—"}
            </span>
            <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft/80">
              {eta.etaMin != null ? t("eta.minLabel") : t("eta.tier.ghost")}
            </span>
          </div>
        </div>

        {/* Hairline + meta strip — tier, confidence, band, op-shift */}
        <div className="mt-4 pt-3 border-t border-line/70 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] min-w-0">
            <span className={accent}>{tierLabel}</span>
            {isLiveish && <ConfidenceIcon confidence={eta.confidence} />}
          </div>

          {(showBand || shifted) && (
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/80 shrink-0">
              {showBand && <span className="tabular-nums">{eta.band}</span>}
              {shifted && (
                <span className="line-through decoration-1 text-ink-soft/50 tabular-nums">
                  {t("eta.opShort", { m: eta.operatorEtaMin! })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function PayLine({
  kind,
  t,
}: {
  kind: BoardingPayKind;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  return (
    <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
      {t(kind === "intercity" ? "stop.payIntercity" : "stop.payUrban")}
    </p>
  );
}

function WaitOrBailLine({
  action,
  t,
}: {
  action: WaitOrBail;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const line =
    action.kind === "skipSame"
      ? t("stop.bailSkip", { route: action.routeShort, min: action.etaMin })
      : action.kind === "otherRoute"
        ? t("stop.bailOther", {
            alt: action.altRouteShort,
            min: action.etaMin,
            route: action.routeShort,
          })
        : t("stop.bailLast", { route: action.routeShort });
  return <p className="mt-2 text-[13px] leading-snug text-ink">{line}</p>;
}

function HeadwayLines({
  hint,
  routeShort,
  t,
}: {
  hint: HeadwayHint;
  routeShort: string;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const every = t(hint.source === "observed" ? "stop.headwayObserved" : "stop.headwayScheduled", {
    route: routeShort,
    min: hint.meanMin,
    when: t(HEADWAY_WHEN[hint.when]),
  });
  const last = hint.lastSeenMin != null ? t("stop.headwayLastSeen", { min: hint.lastSeenMin }) : "";
  const chance =
    hint.chancePct != null
      ? t("stop.headwayChance", {
          pct: hint.chancePct,
          time: cyClock(hint.beforeUnix * 1000),
        })
      : "";
  return (
    <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
      {[every, last, chance].filter(Boolean).join(" ")}
    </p>
  );
}

function bandIsInformative(band: string, headlineMin: number | null): boolean {
  if (!band.includes("–")) return false;
  const m = band.match(/^(\d+)\s*–\s*(\d+)/);
  if (!m) return true;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (hi - lo <= 1) return false;
  if (headlineMin != null && Math.abs(lo - headlineMin) <= 1 && Math.abs(hi - headlineMin) <= 1)
    return false;
  return true;
}

function formatClock(unix: number): string {
  return cyClock(unix * 1000);
}

function splitLongName(long: string): [string, string | null] {
  if (!long) return ["", null];
  const parts = long.split(/\s+[—-]\s+/);
  if (parts.length >= 2) {
    return [parts[0].trim(), parts.slice(1).join(" — ").trim()];
  }
  return [long, null];
}
