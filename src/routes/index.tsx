import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { MapPreview } from "@/components/MapPreview";
import { StopCard, type Stop } from "@/components/StopCard";
import { IconSearch, IconSun, IconArrowUpRight } from "@/components/Icons";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aloya — Cyprus bus, the way it should feel" },
      {
        name: "description",
        content:
          "Plan, track and ride Cyprus buses with a calm, intelligent interface. Live ETAs, nearby stops, smart routing.",
      },
      { property: "og:title", content: "Aloya — Cyprus transit" },
      {
        property: "og:description",
        content: "Mediterranean-light transit, redesigned.",
      },
    ],
  }),
  component: Explore,
});

const nearby: Stop[] = [
  {
    id: "412",
    code: "412",
    name: "Eleftheria Square",
    towards: "Old Town",
    etaMin: 4,
    routes: [
      { code: "101", tone: "aegean" },
      { code: "250", tone: "ochre" },
      { code: "30", tone: "olive" },
    ],
    highlight: true,
  },
  {
    id: "089",
    code: "089",
    name: "Stasinou Avenue",
    towards: "Mall of Cyprus",
    etaMin: 12,
    routes: [
      { code: "11", tone: "olive" },
      { code: "102", tone: "aegean" },
    ],
  },
  {
    id: "207",
    code: "207",
    name: "Makariou III · Kennedy",
    towards: "Engomi",
    etaMin: 18,
    routes: [
      { code: "42A", tone: "ochre" },
      { code: "150", tone: "aegean" },
    ],
  },
];

const suggestions = [
  { label: "Finikoudes Promenade", tone: "aegean" as const },
  { label: "Ledra Street", tone: "olive" as const },
  { label: "Paphos Harbour", tone: "ochre" as const },
  { label: "Kourion Beach", tone: "aegean" as const },
];

const chipTone = {
  aegean: "bg-aegean-soft/50 text-aegean-deep",
  ochre: "bg-ochre-soft/60 text-ochre",
  olive: "bg-olive/10 text-olive",
};

function Explore() {
  return (
    <AppShell>
      {/* Greeting */}
      <header className="px-6 pt-2 pb-3 animate-rise">
        <div className="mb-7 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 ring-1 ring-line">
            <IconSun className="size-3.5 text-ochre" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Tue · 24°
            </span>
          </div>
        </div>

        <h1 className="font-display text-[40px] leading-[1.05] text-balance text-ink">
          Kalimera, Andreas.
          <br />
          <span className="italic text-olive-soft">Where in Cyprus today?</span>
        </h1>
      </header>

      {/* Search */}
      <div className="px-6 mt-5 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="relative flex items-center">
          <span className="absolute left-4 text-ink-soft">
            <IconSearch className="size-4" />
          </span>
          <input
            type="text"
            placeholder="Stop, street or route…"
            className="w-full rounded-2xl bg-card py-4 pl-11 pr-4 text-[15px] ring-1 ring-line placeholder:text-ink-soft/60 outline-none focus:ring-aegean-deep/30 transition-all"
          />
          <span className="absolute right-3 rounded-xl bg-ink px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-limestone">
            ⌘ K
          </span>
        </div>
      </div>

      {/* Suggestions */}
      <div
        className="mt-4 flex gap-2 overflow-x-auto no-scrollbar px-6 pb-1 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
        {suggestions.map((s) => (
          <button
            key={s.label}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium ${chipTone[s.tone]}`}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <section
        className="px-6 mt-6 animate-rise"
        style={{ animationDelay: "200ms" }}
      >
        <MapPreview />
      </section>

      {/* Quick triptych */}
      <section
        className="px-6 mt-5 grid grid-cols-3 gap-2 animate-rise"
        style={{ animationDelay: "260ms" }}
      >
        <QuickStat label="Live buses" value="38" tone="aegean" />
        <QuickStat label="On-time" value="94%" tone="olive" />
        <QuickStat label="Next ride" value="4′" tone="ochre" />
      </section>

      {/* Nearby */}
      <section
        className="mt-8 px-6 animate-rise"
        style={{ animationDelay: "320ms" }}
      >
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Within 6 minutes' walk
            </p>
            <h2 className="font-display text-3xl mt-1 text-ink">Nearby stops</h2>
          </div>
          <Link
            to="/trips"
            className="flex items-center gap-1 text-[12px] font-medium text-aegean-deep"
          >
            All routes
            <IconArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          {nearby.map((s) => (
            <StopCard key={s.id} stop={s} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function QuickStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "aegean" | "ochre" | "olive";
}) {
  const c = {
    aegean: "text-aegean-deep",
    ochre: "text-ochre",
    olive: "text-olive",
  }[tone];
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-line">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl leading-none ${c}`}>{value}</p>
    </div>
  );
}
