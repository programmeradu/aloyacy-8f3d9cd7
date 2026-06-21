// Wave 3 — Kapnos Airport Shuttle suggestion card.
//
// Cyprus public buses don't serve LCA or PFO directly. Kapnos is the
// scheduled coach network locals actually use. When one trip endpoint is
// at an airport, we show this card as a first-class alternative with the
// next three real departures (live from Kapnos's booking API) and an
// honest seat-availability read. We don't sell tickets; we deep-link to
// Kapnos's own booking page where the rider completes the purchase.

import { useI18n } from "@/lib/i18n";
import type { KapnosSuggestion } from "@/lib/kapnos.functions";

function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Above ~1.2 km nobody actually walks with luggage. Switch the label to a
// "city bus or taxi" framing so the suggestion stays honest about effort.
const WALKABLE_M = 1_200;

function fmtTimeLocal(s: string, locale: string): string {
  // s = "YYYY-MM-DD HH:MM:SS" Cyprus local. Display HH:MM directly — it's
  // already the rider's wall-clock time at the stop.
  const time = s.split(" ")[1] ?? "";
  return time.slice(0, 5);
}

function fmtDateChip(s: string, locale: string): string {
  const [date] = s.split(" ");
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  // Compare against today in Cyprus to label "today / tomorrow".
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(new Date()); // "YYYY-MM-DD"
  if (today === date) return ""; // omit; common case
  const [tY, tM, tD] = today.split("-").map((n) => parseInt(n, 10));
  const a = Date.UTC(Y, M - 1, D);
  const b = Date.UTC(tY, tM - 1, tD);
  const diffDays = Math.round((a - b) / 86_400_000);
  if (diffDays === 1) return locale === "el" ? "αύριο" : "tomorrow";
  return new Intl.DateTimeFormat(locale === "el" ? "el-CY" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(Y, M - 1, D)));
}

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

export function KapnosShuttleCard({
  suggestion,
}: {
  suggestion: KapnosSuggestion;
}) {
  const { t, locale } = useI18n();
  const rideMin = fmtMin(suggestion.rideSec);
  const next = suggestion.departures[0];
  const nextDepart = fmtTimeLocal(next.departLocal, locale);
  const nextArrive = fmtTimeLocal(next.arriveLocal, locale);

  return (
    <article className="rounded-[28px] bg-card ring-1 ring-line p-5 flex flex-col gap-4 animate-rise">
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-aegean-deep">
          {t("kapnos.eyebrow")}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {suggestion.routeCode}
        </p>
      </header>

      <h3 className="font-display text-[22px] leading-[1.15] text-ink text-balance">
        {t("kapnos.title", { route: suggestion.routeName })}
      </h3>

      <ol className="flex flex-col gap-2.5">
        <li className="rounded-2xl bg-limestone-soft/60 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums">
            01
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[15px] leading-tight text-ink">
              {suggestion.pickup.name}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
              {t(
                suggestion.pickup.distanceM > WALKABLE_M
                  ? "kapnos.transferMeta"
                  : "kapnos.walkMeta",
                { walk: fmtWalk(suggestion.pickup.distanceM) },
              )}
            </p>
          </div>
        </li>
        <li className="rounded-2xl bg-aegean-soft/40 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums">
            02
          </span>
          <div className="flex-1">
            <p className="font-display text-[15px] leading-tight text-ink tabular-nums">
              {t("kapnos.rideLine", {
                depart: nextDepart,
                arrive: nextArrive,
                m: rideMin,
              })}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">
              {t("kapnos.priceFromLabel", { price: next.priceFrom })}
            </p>
          </div>
        </li>
        <li className="rounded-2xl bg-limestone-soft/60 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums">
            03
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[15px] leading-tight text-ink">
              {suggestion.dropoff.name}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
              {t("kapnos.walkMeta", { walk: fmtWalk(suggestion.dropoff.distanceM) })}
            </p>
          </div>
        </li>
      </ol>

      <section className="rounded-2xl ring-1 ring-line/60 p-3 flex flex-col gap-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("kapnos.nextDeparturesLabel")}
        </p>
        <ul className="flex flex-col">
          {suggestion.departures.map((d, idx) => {
            const dayChip = fmtDateChip(d.departLocal, locale);
            const seatsLow = d.seatsAvailable > 0 && d.seatsAvailable <= 8;
            const sold = d.seatsAvailable <= 0;
            return (
              <li
                key={d.tripId}
                className={`flex items-baseline justify-between gap-3 py-1.5 ${
                  idx === 0 ? "" : "border-t border-line/40"
                }`}
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-display text-[15px] text-ink tabular-nums">
                    {fmtTimeLocal(d.departLocal, locale)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
                    {t("kapnos.arrivesAt", { time: fmtTimeLocal(d.arriveLocal, locale) })}
                  </span>
                  {dayChip && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep">
                      {dayChip}
                    </span>
                  )}
                </div>
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.18em] tabular-nums ${
                    sold
                      ? "text-red-700"
                      : seatsLow
                        ? "text-ochre-deep"
                        : "text-ink-soft"
                  }`}
                >
                  {sold
                    ? t("kapnos.soldOut")
                    : t("kapnos.seatsLeft", { n: d.seatsAvailable })}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          href={suggestion.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-ink px-4 py-2.5 font-sans text-[13px] font-semibold text-limestone transition-colors hover:bg-ochre-deep"
        >
          {t("kapnos.bookCta")}
        </a>
        <a
          href={suggestion.routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-card ring-1 ring-line px-4 py-2.5 font-sans text-[13px] font-semibold text-ink transition-colors hover:ring-aegean/40"
        >
          {t("kapnos.timetableCta")}
        </a>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
        {t("kapnos.disclaimer")}
      </p>
    </article>
  );
}
