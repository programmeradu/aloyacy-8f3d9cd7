import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { tidy } from "../shared";
import pulseAirImg from "@/assets/pulse-air.webp";

/* Air quality: only shown when notable (moderate or worse, or Saharan dust) */

const BAND = {
  en: { good: "Good", fair: "Fair", moderate: "Moderate", poor: "Poor", "very-poor": "Very poor" },
  el: { good: "Καλή", fair: "Μέτρια", moderate: "Αυξημένη", poor: "Κακή", "very-poor": "Πολύ κακή" },
} as const;

export function AirCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["air"]>;
  city: string;
  isEl: boolean;
}) {
  const band = payload.band ? BAND[isEl ? "el" : "en"][payload.band] : isEl ? "Σκόνη" : "Dusty";
  const warm = payload.band === "poor" || payload.band === "very-poor";
  return (
    <article className="r-pc r-pc--half" data-card="air">
      <div className="r-pc-art">
        <img src={pulseAirImg} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      </div>
      <div className="r-pc-body">
        <span className="r-pc-kick">{isEl ? `Αέρας, ${city}` : `Air in ${city}`}</span>
        <span className="r-pc-big" data-tone={warm ? "warm" : undefined}>
          {band}
        </span>
        {payload.europeanAqi != null && (
          <span className="r-pc-sub">
            {isEl ? "Δείκτης ποιότητας " : "Air quality index "}
            <b>{Math.round(payload.europeanAqi)}</b>
          </span>
        )}
        {payload.summary ? <p className="r-pc-text">{tidy(payload.summary)}</p> : null}
        {payload.dustAlert && (
          <span className="r-pc-tag">{isEl ? "Σκόνη από τη Σαχάρα" : "Saharan dust"}</span>
        )}
      </div>
    </article>
  );
}
