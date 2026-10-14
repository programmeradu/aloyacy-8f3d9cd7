// Training pipeline aggregator. Called by pg_cron every 15 min (fast loop)
// and at 03:10 UTC daily (full roll-up). Reads raw signals — rider GPS
// fixes, RT snapshots, active trips, training events — and updates the
// rollup tables the planner reads at request time.
//
// Auth: bypassed at /api/public/*; we additionally require the project's
// anon key in the `apikey` header (canonical cron pattern). All writes go
// through the service-role client.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  rollupSegmentRuntimes,
  rollupDwellTimes,
  rollupFeedVsTruth,
} from "@/lib/train/rollups.server";
import {
  rollupCrowding,
  rollupHeadways,
  processTrainingEvents,
  detectNoShows,
} from "@/lib/train/signals.server";
import { isCronAuthorized } from "@/lib/cron-auth.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const QuerySchema = z.object({ mode: z.enum(["fast", "full"]).default("fast") });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function guard(request: Request) {
  // Bearer CRON_SECRET only; refuses everything when the secret is unset.
  if (!isCronAuthorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);
  return null;
}

export const Route = createFileRoute("/api/public/hooks/train")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => await runFromRequest(request),
      POST: async ({ request }) => await runFromRequest(request),
    },
  },
});

async function runFromRequest(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const mode = QuerySchema.parse({ mode: url.searchParams.get("mode") ?? "fast" }).mode;

  const started = new Date();
  const stats: Record<string, number> = {};
  try {
    stats.segmentRuntimes = await rollupSegmentRuntimes();
    stats.dwell = await rollupDwellTimes();
    stats.feedTruth = await rollupFeedVsTruth();
    stats.crowding = await rollupCrowding();
    stats.headway = await rollupHeadways();
    stats.trainingEvents = await processTrainingEvents();
    if (mode === "full") {
      stats.noShows = await detectNoShows();
    }
    const ok = true;
    await supabaseAdmin.from("training_runs").insert({
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      stats,
      ok,
    });
    return json({ ok, mode, stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : "training failed";
    await supabaseAdmin.from("training_runs").insert({
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      stats: { ...stats, error: 1 },
      ok: false,
    });
    return json({ ok: false, mode, stats, error: message }, 500);
  }
}
