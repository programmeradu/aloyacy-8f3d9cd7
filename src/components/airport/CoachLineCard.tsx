// Kapnos intercity coach — rendered as a row in the same departures list
// as the urban DepartureRows. Card shape matches DepartureRow chrome so
// the page reads as one continuous list, not a separate article section.

import kapnosLogo from "@/assets/kapnos-logo.png.asset.json";
import type { AirportCoachLine } from "@/lib/airport.functions";
import type { AirportCopy } from "@/lib/airport-page";

export function CoachLineCard({ line, c }: { line: AirportCoachLine; c: AirportCopy }) {
  const next = line.nextDepartures[0];
  return (
    <article className="rounded-[24px] bg-card ring-1 ring-line p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={kapnosLogo.url}
            alt=""
            className="h-9 w-9 rounded-md object-contain bg-white ring-1 ring-line/60 p-0.5 shrink-0"
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
              {c.coachKicker}
            </p>
            <p className="mt-0.5 font-display text-[20px] leading-tight text-ink truncate">
              → {line.destinationCity}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
            {line.rideMin} min
          </p>
          {line.priceFrom ? (
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/60 tabular-nums">
              {c.fromLabel} {line.priceFrom}
            </p>
          ) : null}
        </div>
      </header>

      {line.nextDepartures.length > 0 && (
        <ul className="mt-3 flex flex-col rounded-2xl ring-1 ring-line/60 divide-y divide-line/40">
          {line.nextDepartures.slice(0, 3).map((d) => {
            const sold = d.seatsAvailable <= 0;
            const low = d.seatsAvailable > 0 && d.seatsAvailable <= 8;
            return (
              <li
                key={`${d.tripId}-${d.depart}`}
                className="flex items-baseline justify-between gap-3 px-3 py-2 font-mono text-[12px] tabular-nums"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-[16px] text-ink">{d.depart}</span>
                  <span className="text-ink-soft">→</span>
                  <span className="text-ink/80">{d.arrive}</span>
                  {d.dayChip ? (
                    <span className="ml-1 text-[9.5px] uppercase tracking-[0.18em] text-ochre-deep">
                      {d.dayChip}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`text-[9.5px] uppercase tracking-[0.18em] ${
                    sold ? "text-red-700" : low ? "text-ochre-deep" : "text-ink/55"
                  }`}
                >
                  {sold ? c.sold : c.seatsLeft(d.seatsAvailable)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-ink-soft truncate min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink/40">
            {c.pickup}:
          </span>{" "}
          {line.pickupName}
        </p>
        <div className="flex gap-2 shrink-0">
          <a
            href="https://kapnosairportshuttle.com/timetables"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-card ring-1 ring-line px-3 py-1.5 font-sans text-[12px] font-semibold text-ink hover:ring-aegean/40"
          >
            {c.timetableCta}
          </a>
          <a
            href="https://kapnosairportshuttle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-full px-3 py-1.5 font-sans text-[12px] font-semibold transition-colors ${
              next && next.seatsAvailable <= 0
                ? "bg-card ring-1 ring-line text-ink/50 pointer-events-none"
                : "bg-ink text-limestone hover:bg-ochre-deep"
            }`}
          >
            {c.bookCta}
          </a>
        </div>
      </div>
    </article>
  );
}
