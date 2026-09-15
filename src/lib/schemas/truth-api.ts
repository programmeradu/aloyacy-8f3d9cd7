// Zod schemas for the versioned B2B Truth API (`/api/v1/truth/*`).
// Strict boundary validation rejecting malformed queries before database or snapshot calls.

import { z } from "zod";

export const TruthEtaQuerySchema = z.object({
  stop_id: z.string().trim().min(1, "stop_id is required").max(128),
  route_id: z.string().trim().min(1).max(128).optional(),
  trip_id: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type TruthEtaQuery = z.infer<typeof TruthEtaQuerySchema>;

export const TruthAuthHeaderSchema = z.object({
  "x-api-key": z.string().min(8).max(256).optional(),
});
