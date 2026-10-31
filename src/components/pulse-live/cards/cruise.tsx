import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { tidy } from "../shared";
import pulseCruiseImg from "@/assets/pulse-cruise-card.jpg";

/* Cruises: ships calling at Limassol today, and what that means for the buses */

export function CruiseCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["cruises"]>;
  isEl: boolean;
}) {
  const loc = isEl ? "el-GR" : "en-GB";
  const pax = payload.totalPassengers;
  const shipWord =
    payload.count === 1 ? (isEl ? "κρουαζιερόπλοιο" : "ship") : isEl ? "κρουαζιερόπλοια" : "ships";
  const surge =
    pax >= 4000
      ? isEl
        ? "Περιμένετε γεμάτα λεωφορεία προς το Παλιό Λιμάνι και το κέντρο."
        : "Expect full buses to the Old Port and the city centre."
      : pax >= 2000
        ? isEl
          ? "Τα λεωφορεία προς το λιμάνι ίσως έχουν κόσμο."
          : "Buses to the port may be busy."
        : null;
  const times = (a: string | null, d: string | null) =>
    a && d
      ? isEl
        ? `${a} έως ${d}`
        : `${a} to ${d}`
      : a
        ? isEl
          ? `άφιξη ${a}`
          : `arrives ${a}`
        : d
          ? isEl
            ? `αναχώρηση ${d}`
            : `leaves ${d}`
          : "";
  return (
    <article className="r-pc" data-card="cruise">
      <div className="r-pc-art">
        <img src={pulseCruiseImg} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      </div>
      <div className="r-pc-body">
        <span className="r-pc-kick">{isEl ? "Λιμάνι Λεμεσού σήμερα" : "Limassol port today"}</span>
        <span className="r-pc-big">
          {payload.count}
          <small>{shipWord}</small>
        </span>
        {pax > 0 && (
          <p className="r-pc-text">
            {isEl
              ? `Περίπου ${pax.toLocaleString(loc)} επιβάτες βγαίνουν στην πόλη.`
              : `About ${pax.toLocaleString(loc)} guests coming ashore.`}
          </p>
        )}
        {payload.summary ? <p className="r-pc-text">{tidy(payload.summary)}</p> : null}
        {surge && <p className="r-pc-note">{surge}</p>}
        {payload.ships.length > 0 && (
          <ul className="r-pc-rows">
            {payload.ships.slice(0, 4).map((s, i) => {
              const when = times(s.arrival, s.departure);
              return (
                <li key={i} className="r-pc-row">
                  <b>{s.shipName}</b>
                  {when ? <span>{when}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}
