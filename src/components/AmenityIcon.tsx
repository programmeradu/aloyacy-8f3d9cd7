// Premium amenity glyphs — bespoke SVGs for stop affordances.
// Replaces verbose text pills with quiet, Apple-grade icon chips that
// reveal their localized label on hover (desktop) or tap (touch).
//
// Safe to nest inside <a> — uses span/role=button and stops propagation.

import { useEffect, useRef, useState } from "react";
import { useI18n, type DictKey } from "@/lib/i18n";

export type AmenityKey = "shelter" | "shade" | "seating" | "stepFree";

const LABEL_KEYS: Record<AmenityKey, DictKey> = {
  shelter: "amenity.shelter" as DictKey,
  shade: "amenity.shade" as DictKey,
  seating: "amenity.seating" as DictKey,
  stepFree: "amenity.stepFree" as DictKey,
};

function Glyph({ kind }: { kind: AmenityKey }) {
  // 20x20 viewBox, 1.4 stroke. Drawn with intentional asymmetry so the
  // set reads as a bespoke family — not a generic icon pack.
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "block",
  };

  switch (kind) {
    case "shelter":
      // Arched canopy on two slender posts — a Cyprus bus shelter abstracted.
      return (
        <svg {...common}>
          <path d="M3.5 8.5 Q10 3 16.5 8.5" />
          <path d="M3.5 8.5 L3.5 9.6" />
          <path d="M16.5 8.5 L16.5 9.6" />
          <path d="M5 9.6 L5 16" />
          <path d="M15 9.6 L15 16" />
          <path d="M5 12.5 L15 12.5" opacity="0.45" />
        </svg>
      );
    case "shade":
      // Sun half-eclipsed by a soft cloud/awning — shade, not just sun.
      return (
        <svg {...common}>
          <circle cx="13" cy="8" r="3.2" />
          <path d="M13 3.4 L13 4.4" />
          <path d="M16.6 4.4 L15.9 5.1" />
          <path d="M9.4 4.4 L10.1 5.1" />
          <path d="M17.6 8 L16.6 8" opacity="0.55" />
          <path d="M3.5 14.5 Q6 11.5 9 13 Q11 11 13.5 12.5 Q16 12 16.5 14.5 Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M3.5 14.5 Q6 11.5 9 13 Q11 11 13.5 12.5 Q16 12 16.5 14.5" />
        </svg>
      );
    case "seating":
      // Bench: seat slab, backrest hint, two legs.
      return (
        <svg {...common}>
          <path d="M3 11 L17 11" />
          <path d="M3 11 L3 9.5" opacity="0.55" />
          <path d="M17 11 L17 9.5" opacity="0.55" />
          <path d="M5 11 L5 16" />
          <path d="M15 11 L15 16" />
          <path d="M3.5 13 L16.5 13" opacity="0.35" />
        </svg>
      );
    case "stepFree":
      // Gentle ramp rising to a platform with a forward arrow — step-free access.
      return (
        <svg {...common}>
          <path d="M3 15 L13 15 L13 9" />
          <path d="M3 15 L13 9" />
          <path d="M13 9 L17 9" />
          <path d="M15.2 7.4 L17 9 L15.2 10.6" />
        </svg>
      );
  }
}

export function AmenityIcon({
  kind,
  side = "top",
}: {
  kind: AmenityKey;
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

  const label = t(LABEL_KEYS[kind]);

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
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
      className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-limestone ring-1 ring-olive/25 text-olive-deep shadow-[0_1px_0_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] transition-[transform,box-shadow,background] duration-200 hover:-translate-y-px hover:bg-olive/8 hover:ring-olive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegean-deep/50 cursor-help"
    >
      <Glyph kind={kind} />
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
