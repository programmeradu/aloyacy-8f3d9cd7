import { Link } from "@tanstack/react-router";
import { RouteChip } from "./RouteChip";
import { IconArrowUpRight } from "./Icons";
import stopShelter from "@/assets/stop-shelter.png";
import stopPole from "@/assets/stop-pole.png";
import stopTerminal from "@/assets/stop-terminal.png";

type Tone = "aegean" | "ochre" | "olive";
export type StopKind = "shelter" | "pole" | "terminal";

export type Stop = {
  id: string;
  code: string;
  name: string;
  towards: string;
  etaMin: number | null;
  routes: { code: string; tone: Tone }[];
  highlight?: boolean;
  kind?: StopKind;
};

// Per-archetype vignette tuning: each painted asset has a different silhouette,
// so it needs its own size/anchor/mask to read cleanly in the bottom-right.
const VIGNETTES: Record<
  StopKind,
  { src: string; className: string; mask: string }
> = {
  shelter: {
    src: stopShelter,
    className: "-right-5 -bottom-3 w-40",
    mask: "radial-gradient(110% 110% at 100% 100%, #000 35%, transparent 78%)",
  },
  pole: {
    src: stopPole,
    className: "right-1 -bottom-2 w-14 -scale-x-100",
    mask: "radial-gradient(140% 130% at 100% 100%, #000 50%, transparent 85%)",
  },
  terminal: {
    src: stopTerminal,
    className: "-right-6 -bottom-2 w-48 -scale-x-100",
    mask: "radial-gradient(110% 110% at 100% 100%, #000 35%, transparent 78%)",
  },
};

export function StopCard({ stop }: { stop: Stop }) {
  const tone = stop.highlight ? "text-aegean-deep" : "text-olive/40";
  const v = VIGNETTES[stop.kind ?? "shelter"];
  return (
    <Link
      to="/stop/$stopId"
      params={{ stopId: stop.id }}
      className="group relative block overflow-hidden rounded-3xl bg-card p-5 ring-1 ring-line transition-all hover:ring-aegean/30 hover:-translate-y-0.5"
    >
      {/* Painted stop archetype — shelter / pole / terminal, anchored bottom-right */}
      <img
        src={v.src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={1024}
        height={1024}
        className={`pointer-events-none select-none absolute transition-opacity ${v.className} ${
          stop.highlight ? "opacity-[0.4]" : "opacity-[0.28]"
        } group-hover:opacity-[0.5]`}
        style={{ maskImage: v.mask, WebkitMaskImage: v.mask }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
              Stop {stop.code}
            </p>
            <h3 className="mt-0.5 font-display text-[22px] leading-tight text-pretty text-ink">
              {stop.name}
            </h3>
            <p className="mt-1 text-xs text-ink-soft">towards {stop.towards}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stop.routes.map((r) => (
              <RouteChip key={r.code} code={r.code} tone={r.tone} size="sm" />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline">
            <span className={`font-display text-5xl leading-none ${tone}`}>
              {stop.etaMin}
            </span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft/70">
            min away
          </span>
          <span className="mt-2 flex size-7 items-center justify-center rounded-full bg-limestone-soft text-ink-soft transition-colors group-hover:bg-aegean-deep group-hover:text-white">
            <IconArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
