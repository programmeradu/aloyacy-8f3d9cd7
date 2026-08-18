// Presentational cards for the live trip-info page.
//
// Split out of `src/routes/trip-info.$tripId.tsx` so the route file stays
// about data loading and page structure. Each card carries its own bespoke
// SVG motif (road, clock face, status wave) — no icon set, per the design
// system — and takes only already-resolved values, so they render identically
// during SSR and after the live feed updates.

export function NextStopCard({
  label,
  name,
  code,
  minsTo,
  finished,
}: {
  label: string;
  name: string;
  code: string | null;
  minsTo: number | null;
  finished: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-card ring-1 ring-line p-5">
      {/* bespoke road bg */}
      <svg
        aria-hidden
        viewBox="0 0 400 160"
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="roadFade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="color-mix(in oklab, var(--ochre) 18%, transparent)" />
            <stop offset="100%" stopColor="color-mix(in oklab, var(--ochre) 0%, transparent)" />
          </linearGradient>
        </defs>
        <path
          d="M -20 130 Q 120 60 220 90 T 440 50"
          fill="none"
          stroke="url(#roadFade)"
          strokeWidth="44"
          strokeLinecap="round"
        />
        <path
          d="M -20 130 Q 120 60 220 90 T 440 50"
          fill="none"
          stroke="color-mix(in oklab, var(--ochre) 55%, transparent)"
          strokeWidth="1.2"
          strokeDasharray="6 8"
          strokeLinecap="round"
        />
        <circle cx="350" cy="40" r="22" fill="color-mix(in oklab, var(--ochre) 14%, transparent)" />
      </svg>

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-ochre animate-pulse" />
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {label}
            </p>
          </div>
          <p className="mt-2 font-display text-[26px] leading-[1.08] text-ink text-pretty break-words">
            {name}
          </p>
          {code && (
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              #{code}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {finished ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
              —
            </span>
          ) : (
            <>
              <p className="font-display text-[44px] leading-none text-ochre tabular-nums">
                {minsTo ?? 0}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                min
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function EtaCard({
  label,
  eta,
  minsTo,
  finished,
}: {
  label: string;
  eta: string;
  minsTo: number | null;
  finished: boolean;
}) {
  const angle = finished || minsTo == null ? 0 : ((minsTo % 60) / 60) * 360;
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line p-4">
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className="pointer-events-none absolute -right-6 -bottom-6 h-28 w-28 opacity-[0.18]"
      >
        <circle cx="60" cy="60" r="46" fill="none" stroke="var(--aegean-deep)" strokeWidth="1.2" />
        <circle
          cx="60"
          cy="60"
          r="36"
          fill="none"
          stroke="var(--aegean-deep)"
          strokeWidth="0.6"
          strokeDasharray="2 6"
        />
        <g transform={`rotate(${angle} 60 60)`}>
          <line
            x1="60"
            y1="60"
            x2="60"
            y2="24"
            stroke="var(--aegean-deep)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <circle cx="60" cy="60" r="2.5" fill="var(--aegean-deep)" />
      </svg>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-[26px] leading-none text-ink tabular-nums">{eta}</p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">clock</p>
    </div>
  );
}

export function StatusCard({
  label,
  status,
  text,
}: {
  label: string;
  status: "ontime" | "late" | "early" | "done";
  text: string;
}) {
  const tone =
    status === "late"
      ? "text-ochre"
      : status === "early"
        ? "text-aegean-deep"
        : status === "done"
          ? "text-ink-soft"
          : "text-olive";
  const wave =
    status === "late"
      ? "M0 30 Q15 10 30 30 T60 30 T90 30 T120 30"
      : status === "early"
        ? "M0 30 Q15 50 30 30 T60 30 T90 30 T120 30"
        : "M0 30 L120 30";
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line p-4">
      <svg
        aria-hidden
        viewBox="0 0 120 60"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-[0.22]"
        preserveAspectRatio="none"
      >
        <path d={wave} fill="none" stroke="currentColor" strokeWidth="1.2" className={tone} />
        <path
          d={wave}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeDasharray="3 5"
          className={tone}
          transform="translate(0 6)"
        />
      </svg>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">{label}</p>
      <p className={`mt-2 font-display text-[20px] leading-[1.1] text-pretty ${tone}`}>{text}</p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {status === "done"
          ? "end"
          : status === "ontime"
            ? "steady"
            : status === "late"
              ? "delayed"
              : "ahead"}
      </p>
    </div>
  );
}
