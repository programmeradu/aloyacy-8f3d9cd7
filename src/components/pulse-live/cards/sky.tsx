import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import pulseSkyImg from "@/assets/pulse-sky-card.jpg";

/* Flights: arrivals and departures in the next hour at Larnaca and Paphos */

const CITY_EL: Record<string, string> = { Larnaca: "Λάρνακα", Paphos: "Πάφος" };

export function SkyCard({
  payloads,
  isEl,
}: {
  payloads: PulseLiveBundle["flights"];
  isEl: boolean;
}) {
  const arr = payloads.reduce((s, p) => s + p.arrivalsNext60, 0);
  const dep = payloads.reduce((s, p) => s + p.departuresNext60, 0);
  const cities = payloads.map((p) => (isEl ? (CITY_EL[p.city] ?? p.city) : p.city));
  const where = cities.join(isEl ? " και " : " and ");
  const many = cities.length > 1;
  const line =
    arr + dep === 0
      ? isEl
        ? "Ήσυχη ώρα στα αεροδρόμια."
        : "A quiet hour at the airports."
      : isEl
        ? `${many ? "Αεροδρόμια" : "Αεροδρόμιο"} ${where}. Περισσότερος κόσμος στα λεωφορεία του αεροδρομίου.`
        : `${where} ${many ? "airports" : "airport"}. Expect busier airport buses.`;
  return (
    <article className="r-pc r-pc--half" data-card="sky">
      <div className="r-pc-art">
        <img src={pulseSkyImg} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      </div>
      <div className="r-pc-body">
        <span className="r-pc-kick">{isEl ? "Πτήσεις την επόμενη ώρα" : "Flights next hour"}</span>
        <div className="r-pc-stats">
          <span className="r-pc-stat r-pc-stat--lg">
            <b>{arr}</b>
            <span>{isEl ? "αφίξεις" : "arrivals"}</span>
          </span>
          <span className="r-pc-stat r-pc-stat--lg">
            <b>{dep}</b>
            <span>{isEl ? "αναχωρήσεις" : "departures"}</span>
          </span>
        </div>
        <p className="r-pc-text">{line}</p>
      </div>
    </article>
  );
}
