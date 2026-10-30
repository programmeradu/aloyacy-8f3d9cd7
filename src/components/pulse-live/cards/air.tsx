import type { PulseLiveBundle } from "@/lib/pulse-live.functions";

/* ────────────── Air quality — only when notable ───────────────────── */

export function AirCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["air"]>;
  city: string;
  isEl: boolean;
}) {
  const tone = payload.band === "very-poor" || payload.band === "poor" ? "text-ochre" : "text-ink";
  const bandLabel = (() => {
    if (isEl) {
      switch (payload.band) {
        case "good":
          return "Καλή";
        case "fair":
          return "Μέτρια";
        case "moderate":
          return "Αυξημένη";
        case "poor":
          return "Κακή";
        case "very-poor":
          return "Πολύ κακή";
        default:
          return "-";
      }
    }
    switch (payload.band) {
      case "good":
        return "Good";
      case "fair":
        return "Fair";
      case "moderate":
        return "Moderate";
      case "poor":
        return "Poor";
      case "very-poor":
        return "Very poor";
      default:
        return "-";
    }
  })();
  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line px-5 py-5">
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
        {isEl ? "Αέρας · " : "Air · "}
        {city}
      </p>
      <div className="mt-1 flex items-baseline gap-3">
        <span className={`font-display text-[28px] leading-none tracking-[-0.02em] ${tone}`}>
          {bandLabel}
        </span>
        {payload.europeanAqi != null && (
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            AQI {Math.round(payload.europeanAqi)}
          </span>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">{payload.summary}</p>
      {payload.dustAlert && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-ochre/10 ring-1 ring-ochre/30 px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ochre">
          {isEl ? "Σκόνη από τη Σαχάρα" : "Saharan dust"}
        </p>
      )}
    </article>
  );
}
