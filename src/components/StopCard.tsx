import { Link } from "@tanstack/react-router";
import { RouteChip } from "./RouteChip";
import { IconArrowUpRight } from "./Icons";
import oliveSprig from "@/assets/stop-olive-sprig.png";

type Tone = "aegean" | "ochre" | "olive";

export type Stop = {
  id: string;
  code: string;
  name: string;
  towards: string;
  etaMin: number;
  routes: { code: string; tone: Tone }[];
  highlight?: boolean;
};

export function StopCard({ stop }: { stop: Stop }) {
  const tone = stop.highlight ? "text-aegean-deep" : "text-olive/40";
  return (
    <Link
      to="/stop/$stopId"
      params={{ stopId: stop.id }}
      className="group relative block overflow-hidden rounded-3xl bg-card p-5 ring-1 ring-line transition-all hover:ring-aegean/30 hover:-translate-y-0.5"
    >
      {/* Painted olive sprig — Cyprus signifier, low opacity, doesn't compete */}
      <img
        src={oliveSprig}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={`pointer-events-none select-none absolute -right-8 -bottom-10 w-48 rotate-[18deg] transition-opacity ${
          stop.highlight ? "opacity-[0.32]" : "opacity-[0.22]"
        } group-hover:opacity-[0.4]`}
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
