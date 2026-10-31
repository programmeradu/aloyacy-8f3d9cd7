// Football: the next kick-offs, one list card. Times on the island clock,
// "Today" and "Tomorrow" in words, nothing truncated.

import type { PulseLiveBundle } from "@/lib/pulse-live.functions";

const TZ = "Asia/Nicosia";
const ymd = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function FixturesStrip({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["fixtures"]>;
  isEl: boolean;
}) {
  const next = payload.fixtures.slice(0, 3);
  if (next.length === 0) return null;
  const loc = isEl ? "el-GR" : "en-GB";
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86_400_000));
  const dayLabel = (k: Date) => {
    const d = ymd(k);
    if (d === today) return isEl ? "Σήμερα" : "Today";
    if (d === tomorrow) return isEl ? "Αύριο" : "Tomorrow";
    return k.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  };
  return (
    <section className="r-pulse-sec r-fx animate-rise" data-card="fixtures">
      <h2 className="r-pulse-h">
        <span>{isEl ? "Ποδόσφαιρο" : "Football"}</span>
        <small>{isEl ? "Α΄ Κατηγορία" : "Cyprus First Division"}</small>
      </h2>
      <ul className="r-today-list">
        {next.map((f, i) => {
          const k = f.kickoff ? new Date(f.kickoff) : null;
          const ok = k && !Number.isNaN(k.getTime());
          const place = [f.venue, f.city].filter(Boolean).join(", ");
          return (
            <li key={i} className="r-today-row r-fx-row">
              <span className="r-today-rowtxt">
                <span className="r-today-rowtitle">
                  {f.home} <span className="r-fx-v">{isEl ? "vs" : "v"}</span> {f.away}
                </span>
                {place ? <span className="r-today-rowsub">{place}</span> : null}
              </span>
              <span className="r-fx-when">
                {ok && k ? (
                  <>
                    <b>{k.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", timeZone: TZ })}</b>
                    <span>{dayLabel(k)}</span>
                  </>
                ) : (
                  <span>{isEl ? "Ώρα σύντομα" : "Time to follow"}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
