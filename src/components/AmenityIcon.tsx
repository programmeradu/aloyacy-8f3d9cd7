// Typography-led amenity tags. No icon glyphs — per the project's
// design memory: "Icons only when absolutely necessary. Prefer typography,
// numerals, and bespoke SVG illustration over iconography."
//
// Each affordance reads as a tiny ALL-CAPS mono label with a 1px accent
// rule on the left edge. Quiet, editorial, fully legible at mobile size,
// and the label is visible (no hover-only meaning, no tooltip needed).
//
// Safe to nest inside <a> — uses span/role=text only, no click handling.

import { useI18n, type DictKey } from "@/lib/i18n";

export type AmenityKey = "shelter" | "shade" | "seating" | "stepFree";

const LABEL_KEYS: Record<AmenityKey, DictKey> = {
  shelter: "amenity.shelter" as DictKey,
  shade: "amenity.shade" as DictKey,
  seating: "amenity.seating" as DictKey,
  stepFree: "amenity.stepFree" as DictKey,
};

export function AmenityIcon({ kind }: { kind: AmenityKey }) {
  const { t } = useI18n();
  const label = t(LABEL_KEYS[kind]);
  return (
    <span
      aria-label={label}
      className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft leading-none"
    >
      <span
        aria-hidden
        className="h-2.5 w-px bg-aegean-deep/70"
      />
      {label}
    </span>
  );
}
