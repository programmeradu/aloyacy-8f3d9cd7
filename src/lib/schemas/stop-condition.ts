import { z } from "zod";

/** D1 stop condition. Get the consensus, or append one rider report. */
export const StopConditionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get"),
    stopId: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal("report"),
    deviceId: z.string().min(8).max(128),
    stopId: z.string().min(1).max(128),
    attribute: z.enum([
      "has_shelter",
      "has_sign",
      "has_timetable",
      "has_seating",
      "lighting",
      "reachable_on_foot",
      "wheelchair_access",
      "stop_is_ambiguous",
    ]),
    value: z.string().trim().min(1).max(32),
  }),
]);
