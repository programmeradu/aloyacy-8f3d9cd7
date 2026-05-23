// Server-fn wrapper for the multi-leg planner so it can be called from routes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planMultiLegJourney, type MultiLegDiagnostics } from "./journey-multileg.server";
import type { Itinerary } from "./itinerary-types";

const PointSchema = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  label: z.string().max(200).optional(),
});

const InputSchema = z.object({
  from: PointSchema,
  to: PointSchema,
  debug: z.boolean().optional(),
});

export type MultiLegResult = {
  itineraries: Itinerary[];
  searchedAt: number;
  elapsedMs: number;
  diagnostics?: MultiLegDiagnostics;
};

export const planMultiLeg = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<MultiLegResult> => {
    const t0 = Date.now();
    const { itineraries, diagnostics } = await planMultiLegJourney(data.from, data.to, {
      collectDiagnostics: data.debug ?? false,
    });
    return {
      itineraries,
      searchedAt: Math.floor(Date.now() / 1000),
      elapsedMs: Date.now() - t0,
      diagnostics,
    };
  });
