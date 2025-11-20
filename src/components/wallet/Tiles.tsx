import type { ReactNode } from "react";

// Small presentational tiles used on the wallet landing.
export function ActionTile({
  eyebrow,
  value,
  foot,
  onClick,
  tone = "default",
  adornment,
}: {
  eyebrow: string;
  value: string;
  foot: string;
  onClick: () => void;
  tone?: "default" | "aegean";
  adornment?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-[24px] bg-card ring-1 ring-line p-4 hover:ring-aegean-deep/30 transition-all w-full"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {eyebrow}
        </p>
        {adornment && <div className="shrink-0">{adornment}</div>}
      </div>
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
  image,
  imageAlt,
}: {
  label: string;
  value: string;
  sub: string;
  image?: string;
  imageAlt?: string;
}) {
  return (
    <div className="p-4">
      {image && (
        <div className="aspect-[4/3] w-full overflow-hidden rounded-[14px] ring-1 ring-line bg-limestone mb-3">
          <img
            src={image}
            alt={imageAlt ?? ""}
            loading="lazy"
            width={512}
            height={384}
            className="size-full object-cover"
          />
        </div>
      )}
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </p>
      <p className="mt-2 font-sans font-medium text-[22px] text-ink tabular-nums tracking-[-0.02em] leading-none">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-soft">{sub}</p>
    </div>
  );
}
