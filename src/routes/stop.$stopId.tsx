import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MapPreview } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowLeft, IconBus } from "@/components/Icons";

export const Route = createFileRoute("/stop/$stopId")({
  head: ({ params }) => ({
    meta: [
      { title: `Stop ${params.stopId} · Aloya` },
      { name: "description", content: "Live departures from this Cyprus bus stop." },
    ],
  }),
  component: StopDetail,
});

const departures = [
  { route: "102", tone: "aegean" as const, dest: "Engomi · University", eta: 4, capacity: "Calm" },
  { route: "250", tone: "ochre" as const, dest: "Latsia · Tseriou", eta: 9, capacity: "Steady" },
  { route: "30", tone: "olive" as const, dest: "Strovolos · Stavrou", eta: 14, capacity: "Calm" },
  { route: "11", tone: "olive" as const, dest: "Aglantzia · Kyrenias", eta: 18, capacity: "Full" },
  { route: "150", tone: "aegean" as const, dest: "Mall of Cyprus", eta: 26, capacity: "Calm" },
];

function StopDetail() {
  const { stopId } = Route.useParams();

  return (
    <AppShell>
      <div className="px-6 pt-2 pb-4 flex items-center justify-between animate-rise">
        <Link
          to="/"
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Stop · {stopId}
        </span>
        <span className="size-10" />
      </div>

      <header className="px-6 pb-5 animate-rise" style={{ animationDelay: "60ms" }}>
        <h1 className="font-display text-[40px] leading-[1.05] text-ink">
          Eleftheria Square
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          Old town, west side of the bastions · 6 lines pass through
        </p>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MapPreview height="h-44" />
      </section>

      <section
        className="mt-8 px-6 animate-rise"
        style={{ animationDelay: "180ms" }}
      >
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">Departures</h2>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            <span className="size-1.5 rounded-full bg-aegean-deep animate-pulse" />
            Live
          </span>
        </div>

        <div className="rounded-3xl bg-card ring-1 ring-line divide-y divide-line overflow-hidden">
          {departures.map((d, i) => (
            <div
              key={d.route + d.dest}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-limestone-soft/50"
            >
              <RouteChip code={d.route} tone={d.tone} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg leading-tight text-ink truncate">
                  {d.dest}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  <IconBus className="size-3" />
                  {d.capacity}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-display text-3xl leading-none ${
                    i === 0 ? "text-aegean-deep" : "text-ink"
                  }`}
                >
                  {d.eta}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft mt-0.5">
                  min
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="mt-8 px-6 pb-4 animate-rise"
        style={{ animationDelay: "260ms" }}
      >
        <h2 className="font-display text-2xl text-ink mb-3">Around here</h2>
        <div className="grid grid-cols-3 gap-2">
          {["Old Town", "Café Mavros", "Bastion Walk"].map((t, i) => (
            <div
              key={t}
              className={`rounded-2xl p-3 ring-1 ring-line ${
                i === 0 ? "bg-aegean-soft/40" : "bg-card"
              }`}
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                {`${i + 2} min walk`}
              </p>
              <p className="mt-1 font-display text-base leading-tight text-ink">
                {t}
              </p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
