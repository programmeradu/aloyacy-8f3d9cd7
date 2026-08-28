import { z } from "zod";

/** D2 rider skip report. Get the tally, or append one tap. */
export const StopSkipReportSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get"),
    stopId: z.string().min(1).max(128),
    deviceId: z.string().min(8).max(128).optional(),
  }),
  z.object({
    action: z.literal("report"),
    stopId: z.string().min(1).max(128),
    deviceId: z.string().min(8).max(128),
    routeId: z.string().min(1).max(128).optional(),
  }),
]);
