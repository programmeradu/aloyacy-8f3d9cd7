import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import pulseSeaImg from "@/assets/pulse-sea-card.jpg";

/* ────────────── Sea / beach — coastal zones only ───────────────────── */

export function SeaCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["marine"]>;
  city: string;
  isEl: boolean;
}) {
  const verdictLabel = (() => {
    const v = payload.beachVerdict;
    if (!v) return isEl ? "Θάλασσα" : "At sea";
    if (isEl)
      return v === "great"
        ? "Ιδανική"
        : v === "good"
          ? "Καλή"
          : v === "choppy"
            ? "Ταραγμένη"
            : "Άγρια";
    return v === "great"
      ? "Excellent"
      : v === "good"
        ? "Good"
        : v === "choppy"
          ? "Choppy"
          : "Rough";
  })();
  const verdictTone =
    payload.beachVerdict === "great" || payload.beachVerdict === "good"
      ? "text-aegean-deep"
      : "text-ochre";

  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <img
          src={pulseSeaImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 45%, transparent) 60%, var(--color-card) 100%)",
          }}
        />
      </div>
      <div className="relative px-5 pt-3 pb-5">
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
          {isEl ? "Θάλασσα · " : "Sea · "}
          {city}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`font-display text-[26px] leading-none tracking-[-0.02em] ${verdictTone}`}
          >
            {verdictLabel}
          </span>
          {payload.waveHeightM != null && (
            <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
              · {payload.waveHeightM.toFixed(1)}m
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">{payload.summary}</p>
        {payload.seaTempC != null && (
          <p className="mt-2 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            {isEl ? "θερμοκρασία νερού " : "water "}
            {Math.round(payload.seaTempC)}°
          </p>
        )}
      </div>
    </article>
  );
}
