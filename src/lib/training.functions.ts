// Client-side training-event ingestion. Riders' phones emit a handful of
// lightweight signals — walk completed, transfer made/missed, no-show
// reported — into `training_events`. The nightly aggregator rolls these
// into walk_pace_stats, transfer_outcomes, and trip_no_shows.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Kind = z.enum([
  "walk-complete",
  "transfer-made",
  "transfer-missed",
  "no-show-reported",
]);

const Schema = z.object({
  deviceId: z.string().min(8).max(128),
  kind: Kind,
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const logTrainingEvent = createServerFn({ method: "POST" })
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("training_events").insert({
      device_id: data.deviceId,
      kind: data.kind,
      payload: data.payload as unknown as never,
    });
    if (error) {
      console.warn("[training] insert failed", error.message);
      return { ok: false };
    }
    return { ok: true };
  });
