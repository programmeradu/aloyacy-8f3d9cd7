// Tiny premium "signal" glyph that replaces verbose confidence text
// across the app. Three ascending bars; filled by confidence level.
// On hover (desktop) or tap (touch), an editorial tooltip reveals the
// localized confidence label without ever shouting it inline.
//
// Safe to nest inside <a> — uses span/role=button + pointer-handlers
// that stop propagation, never a real <button> element.

import { useEffect, useRef, useState } from "react";
import { useI18n, type DictKey } from "@/lib/i18n";
import type { FreshnessConfidence } from "@/lib/freshness";

const CONF_KEYS: Record<FreshnessConfidence, DictKey> = {
  high: "eta.conf.high",
  medium: "eta.conf.med",
  low: "eta.conf.low",
};

const BAR_TONE: Record<FreshnessConfidence, string> = {
  high: "text-aegean-deep",
  medium: "text-ochre",
  low: "text-ink-soft/70",
};

const FILLED: Record<FreshnessConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

type Size = "sm" | "md";

export function ConfidenceIcon({
  confidence,
  size = "sm",
  side = "top",
}: {
  confidence: FreshnessConfidence;
  size?: Size;
  side?: "top" | "bottom";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const label = t(CONF_KEYS[confidence]);
  const filled = FILLED[confidence];
  const tone = BAR_TONE[confidence];
  const dim = "text-ink-soft/25";
  const dims =
    size === "md" ? { w: 14, h: 12, gap: 2, bars: [4, 7, 10] } : { w: 11, h: 10, gap: 1.5, bars: [3, 6, 9] };

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="relative inline-flex items-center justify-center rounded-full leading-none outline-none focus-visible:ring-1 focus-visible:ring-aegean-deep/50 cursor-help align-middle"
    >
      <svg
        width={dims.w}
        height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        aria-hidden
        className="block"
      >
        {dims.bars.map((bx, i) => {
          const barH = ((i + 1) / 3) * dims.h;
          const active = i < filled;
          return (
            <rect
              key={i}
              x={bx - 1}
              y={dims.h - barH}
              width={2}
              height={barH}
              rx={0.6}
              className={active ? tone : dim}
              fill="currentColor"
            />
          );
        })}
      </svg>

      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-limestone shadow-lg ${
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
