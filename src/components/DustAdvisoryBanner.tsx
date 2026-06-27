// Trip-level Saharan-dust / air-quality banner. Renders only when
// getDustAdvisory returns a non-null payload — the server already gates on
// freshness and severity, so this component is presentation-only.
//
// Visual language: warm ochre wash on limestone, no icons, a bespoke
// "sun-through-haze" SVG mark to signal dust without being literal. Sits
// above the bike/scooter alternative cards so health-sensitive riders see
// it first.

import { useI18n } from "@/lib/i18n";
import type { DustAdvisory } from "@/lib/pulse-live.functions";

export function DustAdvisoryBanner({ advisory }: { advisory: DustAdvisory }) {
  const { locale } = useI18n();
  const isEl = locale === "el";

  const eyebrow = isEl ? "Συμβουλή ποιότητας αέρα" : "Air quality advisory";
  const headline = isEl ? advisory.headlineEl : advisory.headline;
  const advice = isEl ? advisory.adviceEl : advisory.advice;

  // Severity drives a subtle wash intensity (still calm, never alarming).
  const intensity =
    advisory.severity === "heavy-dust"
      ? 38
      : advisory.severity === "dust-front"
        ? 26
        : advisory.severity === "haze"
          ? 16
          : 14;

  return (
    <article
      className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line"
      role="status"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, color-mix(in oklab, var(--color-ochre) ${intensity}%, var(--color-card)) 0%, var(--color-card) 70%)`,
        }}
      />
      <div className="relative px-5 py-4 flex items-start gap-4">
        <SunThroughHaze className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ochre">
            {eyebrow}
          </p>
          <h3 className="mt-1 font-display text-[17px] leading-tight text-ink tracking-[-0.01em]">
            {headline}
          </h3>
          <p className="mt-1.5 text-[13px] leading-snug text-ink-soft text-pretty">{advice}</p>
          {advisory.pm10 != null && (
            <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
              PM10 {Math.round(advisory.pm10)} µg/m³ · {isEl ? advisory.zoneLabelEl : advisory.zoneLabel}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/** Bespoke 40×40 mark — a sun veiled by horizontal dust strata. */
function SunThroughHaze({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={40}
      height={40}
      className={className}
      aria-hidden
    >
      <circle cx="20" cy="18" r="9" fill="var(--color-ochre)" opacity="0.85" />
      <g stroke="var(--color-ochre)" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
        <line x1="4" y1="14" x2="36" y2="14" />
        <line x1="2" y1="22" x2="38" y2="22" />
        <line x1="6" y1="30" x2="34" y2="30" />
      </g>
    </svg>
  );
}
