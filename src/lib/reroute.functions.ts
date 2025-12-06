// Re-plan from the rider's current position. Thin wrapper over planMultiLeg
// used by the early-alight sheet (and reusable by any other "I'm off the
// plan" flow).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planMultiLegJourney } from "./journey-multileg.server";
import { planMultiLegScheduled } from "./journey-scheduled.server";
import type { Itinerary, RideLeg } from "./itinerary-types";

const Point = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  label: z.string().max(200).optional(),
});

const Input = z.object({ from: Point, to: Point });

export const rerouteFromHere = createServerFn({ method: "POST" })
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }) => {
    const [live, sched] = await Promise.all([
      planMultiLegJourney(data.from, data.to).catch(() => null),
      planMultiLegScheduled(data.from, data.to).catch(() => null),
    ]);
    const merged: Itinerary[] = [
      ...(live?.itineraries ?? []),
      ...(sched?.itineraries ?? []),
    ];
    const rank = { live: 0, mixed: 1, estimated: 2 } as const;
    const dedup = new Map<string, Itinerary>();
    for (const it of merged) {
      const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
      const key = rides
        .map((r) => `${r.routeId}|${r.board.stopId}|${r.alight.stopId}`)
        .join("→");
      const existing = dedup.get(key);
      if (!existing || rank[it.source] < rank[existing.source] || it.score < existing.score) {
        dedup.set(key, it);
      }
    }
    const out = [...dedup.values()].sort((a, b) => a.score - b.score).slice(0, 3);
    return { itineraries: out };
  });
