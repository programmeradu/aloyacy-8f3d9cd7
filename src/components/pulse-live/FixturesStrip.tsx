// Football fixtures strip — today's kick-offs with venue and city.

import type { PulseLiveBundle } from "@/lib/pulse-live.functions";

/* ────────────── Football fixtures strip ────────────────────────────── */

export function FixturesStrip({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["fixtures"]>;
  isEl: boolean;
}) {
  const next = payload.fixtures.slice(0, 3);
  if (next.length === 0) return null;
  return (
    <section className="mt-6">
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink-soft mb-2">
        {isEl ? "Επόμενοι αγώνες · Α' Κατηγορία" : "Next up · Cyprus First Division"}
      </p>
      <ul className="grid gap-2">
        {next.map((f, i) => {
          const k = f.kickoff ? new Date(f.kickoff) : null;
          const when = k
            ? `${k.toLocaleDateString(isEl ? "el-GR" : "en-GB", { weekday: "short", day: "numeric", month: "short" })}  ${k.toLocaleTimeString(isEl ? "el-GR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`
            : isEl
              ? "ώρα ΤBA"
              : "time TBA";
          return (
            <li
              key={i}
              className="rounded-[18px] bg-card ring-1 ring-line px-4 py-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-sans font-semibold text-[14px] text-ink truncate">
                  {f.home} <span className="text-ink-soft font-medium">vs</span> {f.away}
                </p>
                {(f.venue || f.city) && (
                  <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.18em] text-ink-soft truncate">
                    {[f.venue, f.city].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.18em] text-ochre tabular-nums whitespace-nowrap">
                {when}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
