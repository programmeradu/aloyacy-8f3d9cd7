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
  tone = "light",
}: {
  label: string;
  value: string;
  sub: string;
  image?: string;
  imageAlt?: string;
  /** "light" = limestone wash with ink text; "dark" = dim wash with cream text (for already-dark images). */
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  return (
    <article
      className="relative h-[92px] overflow-hidden rounded-[16px] ring-1 ring-line"
      aria-label={`${label} fare ${value}`}
    >
      {image && (
        <img
          src={image}
          alt={imageAlt ?? ""}
          loading="lazy"
          width={768}
          height={512}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {/* Color wash so type stays legible */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "linear-gradient(180deg, oklch(0.20 0.04 250 / 0.55) 0%, oklch(0.16 0.05 250 / 0.88) 100%)"
            : "linear-gradient(180deg, oklch(0.96 0.02 85 / 0.55) 0%, oklch(0.96 0.02 85 / 0.90) 100%)",
        }}
      />

      <div className="relative h-full flex flex-col justify-between px-3 py-2.5">
        <p
          className={`font-mono text-[9px] uppercase tracking-[0.22em] ${isDark ? "text-limestone/80" : "text-ink-soft"}`}
        >
          {label}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`font-display text-[20px] leading-none tabular-nums tracking-[-0.01em] ${isDark ? "text-limestone" : "text-ink"}`}
          >
            {value}
          </p>
          <p
            className={`text-[10px] ${isDark ? "text-limestone/75" : "text-ink-soft"}`}
          >
            {sub}
          </p>
        </div>
      </div>
    </article>
  );
}

