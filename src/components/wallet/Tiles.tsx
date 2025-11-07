// Small presentational tiles used on the wallet landing.
export function ActionTile({
  eyebrow,
  value,
  foot,
  onClick,
  tone = "default",
}: {
  eyebrow: string;
  value: string;
  foot: string;
  onClick: () => void;
  tone?: "default" | "aegean";
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-[24px] bg-card ring-1 ring-line p-4 hover:ring-aegean-deep/30 transition-all"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {eyebrow}
      </p>
      <p
        className={`mt-2 font-sans font-medium text-[26px] leading-none tabular-nums tracking-[-0.02em] ${tone === "aegean" ? "text-aegean-deep" : "text-ink"}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-ink-soft">{foot}</p>
    </button>
  );
}

export function Fare({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-soft">{sub}</p>
    </div>
  );
}
