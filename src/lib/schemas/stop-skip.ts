import { z } from "zod";

/** D2 skip rate. One stop; the server tallies and stays silent. */
export const StopSkipSchema = z.object({
  stopId: z.string().min(1).max(128),
});
