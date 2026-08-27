/**
 * Per-stop reliability card. Editorial, Mediterranean, mobile-first.
 * Renders a hero on-time percentage, a tier chip, a soft progress rail,
 * and split metric cells for sample size and mean deviation. Tone shifts
 * subtly by tier via a radial wash rather than a coloured block.
 */
export function StopReliabilityStrip({
  r,
}: {
  r: {
    onTimePct: number;
    meanDelaySec: number;
    sampleCount: number;
    tier: "high" | "medium" | "low" | "unknown";
  };
}) {
  const rated = r.tier !== "unknown";
  const late = r.meanDelaySec > 0;

  const tone =
    r.tier === "high"
      ? {
          num: "text-olive",
          chipBg: "bg-olive-soft/45",
          chipInk: "text-olive",
          wash: "bg-[radial-gradient(120%_90%_at_10%_0%,color-mix(in_oklab,var(--color-olive-soft)_60%,transparent)_0%,transparent_65%)]",
          label: "Reliable",
        }
      : r.tier === "medium"
        ? {
            num: "text-ink",
            chipBg: "bg-ochre-soft/60",
            chipInk: "text-ink",
            wash: "bg-[radial-gradient(120%_90%_at_10%_0%,color-mix(in_oklab,var(--color-ochre-soft)_55%,transparent)_0%,transparent_65%)]",
            label: "Steady",
          }
        : r.tier === "low"
          ? {
              num: "text-destructive",
              chipBg: "bg-destructive/12",
              chipInk: "text-destructive",
              wash: "bg-[radial-gradient(120%_90%_at_10%_0%,color-mix(in_oklab,var(--color-destructive)_14%,transparent)_0%,transparent_65%)]",
              label: "Uneven",
            }
          : {
              num: "text-ink-soft",
              chipBg: "bg-limestone-soft",
              chipInk: "text-ink-soft",
              wash: "",
              label: "Learning",
            };

  const summary = !rated
    ? "Still learning this stop"
    : Math.abs(r.meanDelaySec) < 60
      ? "Usually runs on time"
      : late
        ? r.meanDelaySec < 180
          ? "Usually a minute or two late"
          : "Often runs late"
        : Math.abs(r.meanDelaySec) < 180
          ? "Sometimes leaves a touch early"
          : "Often leaves early";

  const hint = !rated
    ? "Not enough rider data yet"
    : r.tier === "high"
      ? "Safe to plan tight connections"
      : r.tier === "medium"
        ? "Give yourself a small buffer"
        : "Leave a few minutes of buffer";

  return (
    <article className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-line">
      <div className={`absolute inset-0 pointer-events-none ${tone.wash}`} aria-hidden />
      <div className="relative flex items-center gap-4 p-4 sm:p-5">
        <div
          className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full ${tone.chipBg}`}
          aria-hidden
        >
          <span
            className={`font-display text-[20px] leading-none tabular-nums -tracking-[0.02em] ${tone.num}`}
          >
            {rated ? r.onTimePct : "—"}
          </span>
          {rated && (
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-ink-soft mt-0.5">
              on time
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] sm:text-[16px] text-ink leading-snug">{summary}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-soft leading-snug">{hint}</p>
        </div>
        <span
          className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.22em] px-2 py-1 rounded-full ${tone.chipBg} ${tone.chipInk}`}
        >
          {tone.label}
        </span>
      </div>
    </article>
  );
}
