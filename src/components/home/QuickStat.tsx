/** Small stat tile with a bespoke vignette illustration masked into its corner. */
export function QuickStat({
  label,
  value,
  tone,
  vignette,
  vignetteClass,
}: {
  label: string;
  value: string;
  tone: "aegean" | "ochre" | "olive";
  vignette?: string;
  vignetteClass?: string;
}) {
  const c = {
    aegean: "text-aegean-deep",
    ochre: "text-ochre",
    olive: "text-olive",
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-line">
      {vignette && (
        <img
          src={vignette}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={`pointer-events-none select-none absolute ${vignetteClass ?? ""}`}
          style={{
            maskImage: "radial-gradient(110% 110% at 100% 100%, #000 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(110% 110% at 100% 100%, #000 30%, transparent 75%)",
          }}
        />
      )}
      <div className="relative p-3">
        <p className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">{label}</p>
        <p className={`mt-1 font-display text-2xl leading-none ${c}`}>{value}</p>
      </div>
    </div>
  );
}
