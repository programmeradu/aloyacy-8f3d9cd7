// Trip-level Saharan dust and air quality banner, in the shared Roam card
// layout: mark tile row with a PM10 pill, headline, advice. Renders only when
// getDustAdvisory returns a payload; the server already gates on freshness
// and severity, so this component is presentation only. Sits above the bike
// and scooter cards so health-sensitive riders see it first.
// Sentence case, no eyebrows, no middle dots, no em or en dashes.

import { useI18n } from "@/lib/i18n";
import type { DustAdvisory } from "@/lib/pulse-live.functions";

export function DustAdvisoryBanner({ advisory }: { advisory: DustAdvisory }) {
  const { locale } = useI18n();
  const isEl = locale === "el";

  const title = isEl ? "Ποιότητα αέρα" : "Air quality advisory";
  const zone = isEl ? advisory.zoneLabelEl : advisory.zoneLabel;
  const headline = isEl ? advisory.headlineEl : advisory.headline;
  const advice = isEl ? advisory.adviceEl : advisory.advice;

  return (
    <article
      className="r-mob animate-rise flex flex-col gap-2.5 rounded-[26px] bg-white px-[18px] pb-[18px] pt-4 text-[#171717]"
      role="status"
      aria-live="polite"
    >
      <header className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#fbf0d6]">
          <SunThroughHaze />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-5">{title}</p>
          {zone ? (
            <p className="text-[13px] leading-[18px] text-[var(--r-mute,#6f6f6a)]">{zone}</p>
          ) : null}
        </div>
        {advisory.pm10 != null ? (
          <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full bg-[var(--r-pill,#eeeeea)] px-2.5 text-[12px] font-medium [font-variant-numeric:tabular-nums]">
            PM10 {Math.round(advisory.pm10)} µg/m³
          </span>
        ) : null}
      </header>
      <h3 className="text-balance text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
        {headline}
      </h3>
      <p className="text-pretty text-[13px] leading-[1.4] text-[var(--r-mute,#6f6f6a)]">{advice}</p>
    </article>
  );
}

/** A sun veiled by horizontal dust strata. */
function SunThroughHaze() {
  return (
    <svg viewBox="0 0 40 40" width={28} height={28} aria-hidden>
      <circle cx="20" cy="18" r="9" fill="#d99a1e" opacity="0.85" />
      <g stroke="#d99a1e" strokeWidth="2" strokeLinecap="round" opacity="0.6">
        <line x1="4" y1="14" x2="36" y2="14" />
        <line x1="2" y1="22" x2="38" y2="22" />
        <line x1="6" y1="30" x2="34" y2="30" />
      </g>
    </svg>
  );
}
