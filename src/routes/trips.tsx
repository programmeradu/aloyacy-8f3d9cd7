import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RouteChip } from "@/components/RouteChip";
import { IconClock, IconArrowUpRight, IconBus } from "@/components/Icons";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "Trips · Aloya" },
      { name: "description", content: "Plan a journey across Cyprus." },
    ],
  }),
  component: Trips,
});

const journey = [
  { time: "09:42", stop: "Eleftheria Square", note: "Board · Stop 412", state: "now" },
  { time: "09:47", stop: "Solomou Square", note: "Through", state: "pass" },
  { time: "09:53", stop: "Engomi Park", note: "Through", state: "pass" },
  { time: "10:04", stop: "University of Cyprus", note: "Transfer to 150", state: "transfer" },
  { time: "10:21", stop: "Mall of Cyprus", note: "Arrive", state: "end" },
] as const;

const recents = [
  { from: "Larnaca Marina", to: "Finikoudes", route: "425", mins: 18 },
  { from: "Paphos Old Town", to: "Coral Bay", route: "615", mins: 32 },
  { from: "Nicosia Center", to: "Kourion", route: "IC-1", mins: 95 },
];

function Trips() {
  return (
    <AppShell>
      <header className="px-6 pt-2 pb-6 animate-rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Plan a journey
        </p>
        <h1 className="font-display text-4xl mt-2 text-ink">
          From <span className="italic text-aegean-deep">here</span>, to
          anywhere.
        </h1>
      </header>

      {/* Route planner card */}
      <section className="px-6 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="rounded-[28px] bg-card p-5 ring-1 ring-line">
          <Field label="From" value="Eleftheria Square, Nicosia" dotTone="aegean" />
          <div className="my-2 ml-[7px] h-6 w-px border-l border-dashed border-ink/20" />
          <Field label="To" value="Mall of Cyprus" dotTone="ochre" />
          <button className="mt-5 w-full rounded-2xl bg-ink py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-limestone hover:bg-ink/90 transition-colors">
            Find smart route
          </button>
        </div>
      </section>

      {/* Active journey */}
      <section
        className="mt-8 px-6 animate-rise"
        style={{ animationDelay: "160ms" }}
      >
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Live · Route 102
            </p>
            <h2 className="font-display text-2xl mt-1 text-ink">
              Today's journey
            </h2>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-aegean-soft/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-aegean-deep">
            <IconBus className="size-3" /> Onboard
          </span>
        </div>

        <ol className="relative pl-6">
          <span className="absolute left-2 top-2 bottom-2 w-px bg-ink/15" />
          {journey.map((j) => (
            <li key={j.stop} className="relative pb-5 last:pb-0">
              <span
                className={`absolute -left-[18px] top-1.5 size-3 rounded-full ring-4 ring-limestone ${
                  j.state === "now"
                    ? "bg-aegean-deep"
                    : j.state === "end"
                    ? "bg-ochre"
                    : j.state === "transfer"
                    ? "bg-olive"
                    : "bg-ink/25"
                }`}
              />
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`font-display text-lg leading-tight ${
                      j.state === "now" ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    {j.stop}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70 mt-0.5">
                    {j.note}
                  </p>
                </div>
                <span
                  className={`font-mono text-xs tabular-nums ${
                    j.state === "now" ? "text-aegean-deep" : "text-ink-soft"
                  }`}
                >
                  {j.time}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Recent */}
      <section
        className="mt-10 px-6 animate-rise"
        style={{ animationDelay: "240ms" }}
      >
        <h2 className="font-display text-2xl text-ink mb-4">Recent</h2>
        <div className="flex flex-col gap-2">
          {recents.map((r) => (
            <button
              key={r.from + r.to}
              className="group flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-line text-left transition-colors hover:ring-aegean/30"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">
                  {r.from} <span className="text-ink-soft">→</span> {r.to}
                </p>
                <p className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  <IconClock className="size-3" /> {r.mins}m
                </p>
              </div>
              <div className="flex items-center gap-3">
                <RouteChip code={r.route} tone="aegean" size="sm" />
                <IconArrowUpRight className="size-4 text-ink-soft group-hover:text-aegean-deep transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function Field({
  label,
  value,
  dotTone,
}: {
  label: string;
  value: string;
  dotTone: "aegean" | "ochre";
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`size-3.5 rounded-full ring-2 ${
          dotTone === "aegean"
            ? "bg-aegean-deep ring-aegean-soft"
            : "bg-ochre ring-ochre-soft"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">
          {label}
        </p>
        <p className="text-[15px] font-medium text-ink truncate">{value}</p>
      </div>
    </div>
  );
}
