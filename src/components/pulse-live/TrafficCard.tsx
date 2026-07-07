// Traffic card — hero incident plus the next few, with editorial artwork
// chosen by incident kind. Copy normalisation lives in @/lib/pulse-traffic-copy.

import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import {
  friendlyTrafficHeadline,
  friendlyTrafficLine,
  parseStructured,
  specificFromFeed,
  type TrafficKind,
} from "@/lib/pulse-traffic-copy";
import pulseTrafficImg from "@/assets/pulse-traffic-card.jpg";
import pulseTrafficRoadworksImg from "@/assets/pulse-traffic-roadworks.jpg";
import pulseTrafficClosureImg from "@/assets/pulse-traffic-closure.jpg";
import pulseTrafficCongestionImg from "@/assets/pulse-traffic-congestion.jpg";

/** Pick an editorial illustration that matches the dominant kind in view. */
function pickTrafficImage(kind: TrafficKind): string {
  switch (kind) {
    case "roadworks":
      return pulseTrafficRoadworksImg;
    case "closure":
      return pulseTrafficClosureImg;
    case "congestion":
      return pulseTrafficCongestionImg;
    case "accident":
    case "weather":
    default:
      return pulseTrafficImg;
  }
}

export function TrafficCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["traffic"]>;
  city: string;
  isEl: boolean;
}) {
  const top = payload.incidents[0];
  if (!top) return null;

  const severityTone =
    payload.highest === "high"
      ? "text-ochre"
      : payload.highest === "medium"
        ? "text-aegean-deep"
        : "text-olive";

  const severityLabel = isEl
    ? payload.highest === "high"
      ? "Σοβαρό"
      : payload.highest === "medium"
        ? "Μέτριο"
        : "Ήπιο"
    : payload.highest === "high"
      ? "Severe"
      : payload.highest === "medium"
        ? "Notable"
        : "Minor";

  const topStructured = parseStructured(top.headline, isEl);
  const heroHeadline =
    topStructured?.headline ??
    specificFromFeed(top.headline, isEl) ??
    friendlyTrafficHeadline(top.kind, top.road, top.zone, city, isEl);
  const heroImg = pickTrafficImage(topStructured?.kind ?? top.kind);
  const rest = payload.incidents.slice(1, 4);

  return (
    <article className="relative mt-3 overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <div className="relative aspect-[21/9] w-full overflow-hidden">
        <img
          src={heroImg}
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
          {(isEl ? "Κυκλοφορία · " : "Traffic · ") + city}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[34px] leading-none text-ink tabular-nums tracking-[-0.02em]">
            {payload.count}
          </span>
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {payload.count === 1
              ? isEl
                ? "ενεργό συμβάν"
                : "live incident"
              : isEl
                ? "ενεργά συμβάντα"
                : "live incidents"}
          </span>
          <span
            className={`ml-auto font-eyebrow text-[9.5px] uppercase tracking-[0.22em] tabular-nums ${severityTone}`}
          >
            {severityLabel}
          </span>
        </div>

        <div className="mt-3 border-t border-line/60 pt-3">
          <h3 className="font-display text-[18px] leading-tight text-ink text-balance">
            {heroHeadline}
          </h3>
        </div>

        {rest.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {rest.map((inc) => (
              <li key={inc.id} className="text-[12.5px] leading-snug text-ink-soft text-pretty">
                {parseStructured(inc.headline, isEl)?.line ??
                  specificFromFeed(inc.headline, isEl) ??
                  friendlyTrafficLine(inc.kind, inc.road, inc.zone, city, isEl)}
              </li>
            ))}
          </ul>
        )}

        {payload.count > rest.length + 1 && (
          <p className="mt-3 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            +{payload.count - rest.length - 1} {isEl ? "ακόμη ενεργά" : "more active"}
          </p>
        )}
      </div>
    </article>
  );
}
