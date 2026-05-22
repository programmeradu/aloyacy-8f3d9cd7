import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RouteChip } from "@/components/RouteChip";
import { IconPin, IconArrowUpRight } from "@/components/Icons";
import coast from "@/assets/coast-hero.jpg";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Saved · Aloya" },
      { name: "description", content: "Your places across Cyprus." },
    ],
  }),
  component: Saved,
});

const places = [
  {
    label: "Home",
    name: "Aglantzia, 14 Kyrenias",
    routes: [
      { code: "102", tone: "aegean" as const },
      { code: "11", tone: "olive" as const },
    ],
    tone: "aegean",
  },
  {
    label: "Office",
    name: "GSP Stadium, Nicosia",
    routes: [{ code: "150", tone: "aegean" as const }],
    tone: "olive",
  },
  {
    label: "Beach day",
    name: "Finikoudes Promenade",
    routes: [
      { code: "425", tone: "ochre" as const },
      { code: "IC-1", tone: "aegean" as const },
    ],
    tone: "ochre",
  },
];

function Saved() {
  return (
    <AppShell>
      <header className="px-6 pt-2 pb-5 animate-rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Your atlas
        </p>
        <h1 className="font-display text-4xl mt-2 text-ink">
          The places that <span className="italic text-aegean-deep">matter</span>.
        </h1>
      </header>

      {/* Hero collection */}
      <section className="px-6 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="relative h-56 w-full overflow-hidden rounded-[28px] ring-1 ring-line">
          <img
            src={coast}
            alt="Cypriot coastline"
            loading="lazy"
            width={1024}
            height={640}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/65 via-ink/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-limestone">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-80">
              Collection · 6 places
            </p>
            <h3 className="mt-1 font-display text-3xl italic leading-tight">
              Coastal weekends
            </h3>
            <p className="mt-1 text-[12px] opacity-80 max-w-[26ch]">
              Larnaca, Paphos, Ayia Napa — the slow way around.
            </p>
          </div>
        </div>
      </section>

      {/* Place list */}
      <section
        className="mt-7 px-6 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
        <h2 className="font-display text-2xl text-ink mb-4">Pinned</h2>
        <div className="flex flex-col gap-3">
          {places.map((p) => (
            <Link
              key={p.name}
              to="/stop/$stopId"
              params={{ stopId: "412" }}
              className="group flex items-center gap-4 rounded-3xl bg-card p-4 ring-1 ring-line transition-all hover:-translate-y-0.5 hover:ring-aegean/30"
            >
              <span
                className={`flex size-12 items-center justify-center rounded-2xl ${
                  p.tone === "aegean"
                    ? "bg-aegean-soft/60 text-aegean-deep"
                    : p.tone === "ochre"
                    ? "bg-ochre-soft/70 text-ochre"
                    : "bg-olive/10 text-olive"
                }`}
              >
                <IconPin className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {p.label}
                </p>
                <p className="font-display text-lg leading-tight text-ink truncate">
                  {p.name}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.routes.map((r) => (
                    <RouteChip key={r.code} code={r.code} tone={r.tone} size="sm" />
                  ))}
                </div>
              </div>
              <IconArrowUpRight className="size-4 text-ink-soft group-hover:text-aegean-deep transition-colors" />
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
