import type { PulseLiveBundle } from "@/lib/pulse-live.functions";

/* ────────────── Met warnings — only render when active ─────────────── */

export function MetWarningCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["metWarnings"]>;
  isEl: boolean;
}) {
  const w = payload.warnings[0];
  if (!w) return null;
  const accent =
    w.level === "red"
      ? "bg-ochre/15 ring-ochre/40 text-ochre"
      : w.level === "orange"
        ? "bg-ochre/10 ring-ochre/30 text-ochre"
        : "bg-aegean-deep/8 ring-aegean-deep/25 text-aegean-deep";
  const levelLabel = isEl
    ? w.level === "red"
      ? "Κόκκινη"
      : w.level === "orange"
        ? "Πορτοκαλί"
        : "Κίτρινη"
    : w.level;
  return (
    <article className={`relative overflow-hidden rounded-[22px] ring-1 px-5 py-4 mb-4 ${accent}`}>
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.24em] mb-1.5">
        {(isEl ? "Προειδοποίηση Καιρού · " : "Weather warning · ") + levelLabel}
      </p>
      <h3 className="font-display text-[17px] leading-tight text-ink text-balance">
        {w.summary || `${w.kind} · ${w.area}`}
      </h3>
      {payload.count > 1 && (
        <p className="mt-2 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
          +{payload.count - 1} {isEl ? "ακόμη ενεργές" : "more active"}
        </p>
      )}
    </article>
  );
}
