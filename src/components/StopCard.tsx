import { Link } from "@tanstack/react-router";
import { RouteChip } from "./RouteChip";
import { IconArrowUpRight } from "./Icons";
import stopShelter from "@/assets/stop-shelter.png";
import stopPole from "@/assets/stop-pole.png";
import stopTerminal from "@/assets/stop-terminal.png";
import { useI18n } from "@/lib/i18n";
import {
  confidenceDot,
  tierAccent,
  type FreshnessConfidence,
  type FreshnessTier,
} from "@/lib/freshness";

type Tone = "aegean" | "ochre" | "olive";
export type StopKind = "shelter" | "pole" | "terminal";
/** Legacy three-value freshness. Use `etaTier` for richer surfacing. */
export type EtaConfidence = "live" | "predicted" | "scheduled";

export type Stop = {
  id: string;
  code: string;
  name: string;
  towards: string;
  etaMin: number | null;
  /** Source/freshness of the displayed ETA. Drives the colour chip. */
  etaConfidence?: EtaConfidence;
  /** Rich trust tier — preferred over `etaConfidence` when available. */
  etaTier?: FreshnessTier;
  /** Confidence of the ETA model (sample coverage). */
  etaConfidenceLevel?: FreshnessConfidence;
  /** Optional short label ("live", "stale ping", "scheduled"). */
  etaBlurb?: string;
  routes: { code: string; tone: Tone }[];
  highlight?: boolean;
  kind?: StopKind;
  /**
   * Wave 2.2 — optional amenity flags. When undefined we show nothing
   * (honest: no data is better than guessed data).
   */
  amenities?: {
    shelter: boolean;
    shade: boolean;
    seating: boolean;
    stepFree: boolean;
  };
};

const VIGNETTES: Record<
  StopKind,
  { src: string; className: string; mask: string }
> = {
  shelter: {
    src: stopShelter,
    className: "-right-5 -bottom-3 w-40",
    mask: "radial-gradient(110% 110% at 100% 100%, #000 35%, transparent 78%)",
  },
  pole: {
    src: stopPole,
    className: "right-1 -bottom-2 w-14 -scale-x-100",
    mask: "radial-gradient(140% 130% at 100% 100%, #000 50%, transparent 85%)",
  },
  terminal: {
    src: stopTerminal,
    className: "-right-6 -bottom-2 w-48 -scale-x-100",
    mask: "radial-gradient(110% 110% at 100% 100%, #000 35%, transparent 78%)",
  },
};

function tierFromLegacy(
  tier: FreshnessTier | undefined,
  legacy: EtaConfidence | undefined,
): FreshnessTier {
  if (tier) return tier;
  if (legacy === "live") return "live";
  if (legacy === "predicted") return "predicted";
  return "scheduled";
}

export function StopCard({ stop }: { stop: Stop }) {
  const { t } = useI18n();
  const v = VIGNETTES[stop.kind ?? "shelter"];
  const tier = tierFromLegacy(stop.etaTier, stop.etaConfidence);
  const isGhost = tier === "ghost";
  const accent = stop.highlight && (tier === "live" || tier === "rider-confirmed")
    ? "text-aegean-deep"
    : tierAccent(tier);
  const showTierChip = stop.etaMin != null;
  // Ghost: replace the number with "—" so we never claim live time we lack.
  const displayMin = stop.etaMin == null || isGhost ? null : stop.etaMin;

  return (
    <Link
      to="/stop/$stopId"
      params={{ stopId: stop.id }}
      className="group relative block overflow-hidden rounded-3xl bg-card p-5 ring-1 ring-line transition-all hover:ring-aegean/30 hover:-translate-y-0.5"
    >
      <img
        src={v.src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={1024}
        height={1024}
        className={`pointer-events-none select-none absolute transition-opacity ${v.className} ${
          stop.highlight ? "opacity-[0.4]" : "opacity-[0.28]"
        } group-hover:opacity-[0.5]`}
        style={{ maskImage: v.mask, WebkitMaskImage: v.mask }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
              {t("stopCard.code", { code: stop.code })}
            </p>
            <h3 className="mt-0.5 font-display text-[22px] leading-tight text-pretty text-ink">
              {stop.name}
            </h3>
            <p className="mt-1 text-xs text-ink-soft">{t("stopCard.towards", { name: stop.towards })}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stop.routes.map((r) => (
              <RouteChip key={r.code} code={r.code} tone={r.tone} size="sm" />
            ))}
          </div>
          {stop.amenities ? <AmenityRow a={stop.amenities} t={t} /> : null}
        </div>

        <div className="flex flex-col items-end gap-1">
          {displayMin === null ? (
            <>
              <span className={`font-display text-5xl leading-none ${accent}`}>
                —
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft/70 text-right max-w-[7rem]">
                {isGhost ? t("eta.tier.ghost") : t("stopCard.noLiveBus")}
              </span>
            </>
          ) : (
            <>
              <span className={`font-display text-5xl leading-none ${accent}`}>
                {displayMin}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft/70">
                {t("stopCard.minAway")}
              </span>
            </>
          )}
          {showTierChip && (
            <TierChip
              tier={tier}
              confidence={stop.etaConfidenceLevel}
              blurb={stop.etaBlurb}
              t={t}
            />
          )}
          <span className="mt-1 flex size-7 items-center justify-center rounded-full bg-limestone-soft text-ink-soft transition-colors group-hover:bg-aegean-deep group-hover:text-white">
            <IconArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function TierChip({
  tier,
  confidence,
  blurb,
  t,
}: {
  tier: FreshnessTier;
  confidence?: FreshnessConfidence;
  blurb?: string;
  t: (k: never) => string;
}) {
  const dot = confidenceDot(confidence ?? "low");
  const showConfidence =
    !!confidence && (tier === "live" || tier === "rider-confirmed" || tier === "predicted");
  // i18n keys are typed against the dictionary; cast here is intentional —
  // every tier value maps to an existing key.
  const tierLabel = t(`eta.tier.${tier === "rider-confirmed" ? "rider" : tier}` as never);
  return (
    <div className="mt-1 flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
        <span>{tierLabel}</span>
        {showConfidence && (
          <>
            <span className="text-ink-soft/40">·</span>
            <span>{t(`eta.conf.${confidence === "medium" ? "med" : confidence}` as never)}</span>
          </>
        )}
      </span>
      {blurb && tier !== "live" && tier !== "rider-confirmed" && (
        <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-ink-soft/60 text-right max-w-[10rem]">
          {blurb}
        </span>
      )}
    </div>
  );
}

/**
 * Wave 2.2 — surfaces stop affordances when we have curated data. We
 * deliberately render nothing when amenities are undefined.
 */
function AmenityRow({
  a,
  t,
}: {
  a: NonNullable<Stop["amenities"]>;
  t: (k: never) => string;
}) {
  const chips: { label: string; on: boolean }[] = [
    { label: t("amenity.shelter" as never), on: a.shelter },
    { label: t("amenity.shade" as never), on: a.shade },
    { label: t("amenity.seating" as never), on: a.seating },
    { label: t("amenity.stepFree" as never), on: a.stepFree },
  ];
  const positives = chips.filter((c) => c.on);
  if (positives.length === 0) return null;
  return (
    <ul className="-mt-1 flex flex-wrap gap-1">
      {positives.map((c) => (
        <li
          key={c.label}
          className="rounded-full bg-olive/12 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-olive-deep ring-1 ring-olive/25"
        >
          {c.label}
        </li>
      ))}
    </ul>
  );
}


