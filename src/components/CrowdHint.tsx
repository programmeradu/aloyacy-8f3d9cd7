// Inline HUD card surfacing crowd / comfort prediction for the
// active ride. Polls /api route every 90 s; renders nothing when
// we have no data for this route. Editorial tone, no emojis.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteLoad, type CrowdLevel } from "@/lib/crowd.functions";

const COPY: Record<CrowdLevel, { tag: string; line: string; tone: string }> = {
  quiet: {
    tag: "Comfort",
    line: "Plenty of seats — quiet ride.",
    tone: "bg-olive-soft/40 ring-olive/25 text-olive",
  },
  moderate: {
    tag: "Comfort",
    line: "Some seats free.",
    tone: "bg-aegean-soft/40 ring-aegean/25 text-aegean-deep",
  },
  busy: {
    tag: "Comfort",
    line: "Busy — standing likely.",
    tone: "bg-ochre-soft/60 ring-ochre/30 text-ochre",
  },
  packed: {
    tag: "Comfort",
    line: "Packed — consider the next bus if you can.",
    tone: "bg-ochre-soft ring-ochre/40 text-ochre",
  },
};

export function CrowdHint({
  routeId,
  tripId,
}: {
  routeId: string;
  tripId?: string;
}) {
  const fetchLoad = useServerFn(getRouteLoad);
  const { data } = useQuery({
    queryKey: ["crowd", routeId, tripId ?? ""],
    queryFn: () => fetchLoad({ data: { routeId, tripId } }),
    staleTime: 90_000,
    refetchInterval: 90_000,
  });
  if (!data?.level) return null;
  const c = COPY[data.level];
  return (
    <section className="px-6 mt-3 animate-rise">
      <div
        className={`rounded-[22px] ring-1 px-4 py-3 ${c.tone.replace(/text-\S+/, "")}`}
      >
        <p className={`font-mono text-[10px] uppercase tracking-[0.22em] ${c.tone.match(/text-\S+/)?.[0] ?? "text-ink"}`}>
          {c.tag}
        </p>
        <p className="mt-1 text-[13px] text-ink">{c.line}</p>
        {data.sample > 1 && (
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            From {data.sample} recent riders
          </p>
        )}
      </div>
    </section>
  );
}
