import sunVignette from "@/assets/weather-sun.png";

type IconComp = React.ComponentType<{ className?: string }>;

interface Props {
  dayLabel: string;
  tempC: number | null;
  iconKey: string | undefined;
  Icon: IconComp;
  tone: string;
}

/**
 * Editorial weather stamp — a small painted vignette anchors a display-size
 * temperature with the day stamped in mono caps above. Bespoke, not a chip.
 */
export function WeatherStamp({ dayLabel, tempC, iconKey, Icon, tone }: Props) {
  const isSunny = !iconKey || iconKey === "sun";

  return (
    <div className="group relative flex items-center gap-2.5 pl-1 pr-3 py-1.5">
      {/* Painted vignette (only for sun); otherwise the icon does the work */}
      {isSunny ? (
        <img
          src={sunVignette}
          alt=""
          aria-hidden="true"
          width={44}
          height={44}
          className="size-11 -my-1 select-none pointer-events-none drop-shadow-[0_2px_8px_color-mix(in_oklab,var(--color-ochre)_28%,transparent)]"
        />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full bg-card ring-1 ring-line">
          <Icon className={`size-4 ${tone}`} />
        </span>
      )}

      <div className="flex flex-col items-end leading-none">
        <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-ink-soft">
          {dayLabel}
        </span>
        <span className="mt-1 font-display text-[22px] leading-none text-ink tabular-nums">
          {tempC !== null ? (
            <>
              {tempC}
              <span className="text-ochre">°</span>
            </>
          ) : (
            <span className="text-ink-soft">—</span>
          )}
        </span>
      </div>
    </div>
  );
}
