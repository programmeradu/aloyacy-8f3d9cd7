import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { tidy } from "../shared";

/* Weather warnings: only rendered while one is active */

const LEVEL = {
  en: { red: "Red", orange: "Orange", yellow: "Yellow" },
  el: { red: "Κόκκινη", orange: "Πορτοκαλί", yellow: "Κίτρινη" },
} as const;

export function MetWarningCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["metWarnings"]>;
  isEl: boolean;
}) {
  const w = payload.warnings[0];
  if (!w) return null;
  const level = LEVEL[isEl ? "el" : "en"][w.level] ?? "";
  const more = payload.count - 1;
  return (
    <article className="r-pc r-warn" data-level={w.level} data-card="warning">
      <div className="r-pc-body">
        <span className="r-pc-kick">
          {isEl ? `${level} προειδοποίηση καιρού` : `${level} weather warning`}
        </span>
        <h3 className="r-warn-title">{tidy(w.summary) || `${w.kind}, ${w.area}`}</h3>
        {more > 0 && (
          <p className="r-pc-text">
            {isEl ? `Ακόμη ${more} ενεργές` : `${more} more active`}
          </p>
        )}
      </div>
    </article>
  );
}
