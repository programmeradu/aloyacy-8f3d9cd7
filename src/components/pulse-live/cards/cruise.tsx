import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import pulseCruiseImg from "@/assets/pulse-cruise-card.jpg";

/* ────────────── Cruises — Limassol port calls today ────────────────── */

export function CruiseCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["cruises"]>;
  isEl: boolean;
}) {
  const next = payload.ships[0];
  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line sm:col-span-2">
      <div className="relative aspect-[21/9] w-full overflow-hidden">
        <img
          src={pulseCruiseImg}
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
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 40%, transparent) 60%, var(--color-card) 100%)",
          }}
        />
      </div>
      <div className="relative px-6 pt-3 pb-5">
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ochre">
          {isEl ? "Λιμάνι Λεμεσού · σήμερα" : "Limassol port · today"}
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-display text-[34px] leading-none text-ink tabular-nums tracking-[-0.02em]">
            {payload.count}
          </span>
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {payload.count === 1 ? (isEl ? "πλοίο" : "ship") : isEl ? "πλοία" : "ships"}
          </span>
          {payload.totalPassengers > 0 && (
            <span className="ml-auto font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
              ~{payload.totalPassengers.toLocaleString()} {isEl ? "επιβάτες" : "guests"}
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">
          {payload.summary ||
            (next
              ? isEl
                ? `Επόμενο — ${next.shipName}${next.arrival ? ` στις ${next.arrival}` : ""}.`
                : `Next — ${next.shipName}${next.arrival ? ` arriving ${next.arrival}` : ""}.`
              : "")}
        </p>
        {payload.totalPassengers >= 2000 && (
          <p
            className="mt-2 font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ochre"
            role="status"
          >
            {payload.totalPassengers >= 4000
              ? isEl
                ? "Υψηλή κίνηση — αναμένετε γεμάτα δρομολόγια προς το παλιό λιμάνι και το κέντρο"
                : "High surge — expect packed runs to Old Port and city centre"
              : isEl
                ? "Μέτρια κίνηση — δρομολόγια προς λιμάνι ίσως είναι γεμάτα"
                : "Moderate surge — port-bound runs may be busy"}
          </p>
        )}
        {payload.ships.length > 1 && (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {payload.ships.slice(0, 4).map((s, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 border-t border-line/70 pt-1.5"
              >
                <span className="font-sans font-semibold text-[13px] text-ink truncate">
                  {s.shipName}
                </span>
                <span className="font-eyebrow text-[9.5px] uppercase tracking-[0.18em] text-ink-soft tabular-nums whitespace-nowrap">
                  {s.arrival ?? "—"}
                  {s.departure ? ` › ${s.departure}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
