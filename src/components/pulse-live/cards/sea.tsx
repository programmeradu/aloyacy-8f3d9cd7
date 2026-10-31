import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { tidy } from "../shared";
import pulseSeaImg from "@/assets/pulse-sea-card.jpg";

/* Sea: today's beach verdict on the rider's coast (coastal zones only) */

const VERDICT = {
  en: { great: "Excellent", good: "Good", choppy: "Choppy", rough: "Rough" },
  el: { great: "Ιδανική", good: "Καλή", choppy: "Ταραγμένη", rough: "Άγρια" },
} as const;

export function SeaCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["marine"]>;
  city: string;
  isEl: boolean;
}) {
  const v = payload.beachVerdict;
  const label = v ? VERDICT[isEl ? "el" : "en"][v] : isEl ? "Θάλασσα" : "Sea today";
  const wave =
    payload.waveHeightM != null
      ? payload.waveHeightM.toLocaleString(isEl ? "el-GR" : "en-GB", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : null;
  return (
    <article className="r-pc r-pc--half" data-card="sea">
      <div className="r-pc-art">
        <img src={pulseSeaImg} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      </div>
      <div className="r-pc-body">
        <span className="r-pc-kick">{isEl ? `Θάλασσα, ${city}` : `Sea in ${city}`}</span>
        <span className="r-pc-big" data-tone={v === "choppy" || v === "rough" ? "warm" : undefined}>
          {label}
        </span>
        {(wave || payload.seaTempC != null) && (
          <div className="r-pc-stats">
            {wave && (
              <span className="r-pc-stat">
                <b>{wave} m</b>
                <span>{isEl ? "κύμα" : "waves"}</span>
              </span>
            )}
            {payload.seaTempC != null && (
              <span className="r-pc-stat">
                <b>{Math.round(payload.seaTempC)}°</b>
                <span>{isEl ? "νερό" : "water"}</span>
              </span>
            )}
          </div>
        )}
        {payload.summary ? <p className="r-pc-text">{tidy(payload.summary)}</p> : null}
      </div>
    </article>
  );
}
