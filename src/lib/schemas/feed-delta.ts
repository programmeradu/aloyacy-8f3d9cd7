import { z } from "zod";

/** C2 feed-vs-rider clock. One stop; the server stays silent. */
export const FeedDeltaSchema = z.object({
  stopId: z.string().min(1).max(128),
});
