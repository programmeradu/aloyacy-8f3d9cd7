import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planJourney } from "./journey.server";

const PointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().max(200).optional(),
});

export const planTrip = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ from: PointSchema, to: PointSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const options = await planJourney(data.from, data.to);
      return { options, error: null };
    } catch (e) {
      console.error("planTrip failed", e);
      return {
        options: [],
        error: e instanceof Error ? e.message : "Plan failed",
      };
    }
  });
