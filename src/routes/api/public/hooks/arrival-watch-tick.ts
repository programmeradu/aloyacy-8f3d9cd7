// Arrival-promise watcher. Runs every 2 minutes from pg_cron.
//
// One tick: claim the single-flight lease, take a bounded batch of promises,
// re-plan the ones that are due (cadence widens the further out they are),
// persist the new ladder, then fire at most one nudge per promise. Every
// nudge is recorded on the row before we move on, so a retried tick after a
// crash can never notify the same rider twice.

import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** arrival_promises + job_leases are newer than the generated types. */
const db = supabaseAdmin as unknown as SupabaseClient;
import { deliver } from "@/lib/notify.server";
import {
  isReplanDue,
  nextNudge,
  nudgeCopy,
  promiseStatusFor,
  type LadderRung,
  type MarginPref,
  type NudgeKind,
  type PromiseStatus,
} from "@aloya/core/arrival-promise";
import { computePromisePlan, planSnapshot } from "@/lib/arrival-promise.server";
import { logger } from "@/lib/logger";
import { isCronAuthorized } from "@/lib/cron-auth.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

/** Bounded work per run — the rest waits for the next tick. */
const BATCH = 25;
const LEASE_TTL_SEC = 110;

type PromiseRow = {
  id: string;
  user_id: string;
  target_arrival_unix: number;
  margin_pref: MarginPref;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  plan_json: { legs?: Array<{ kind?: string; routeShort?: string }> } | null;
  ladder_json: LadderRung[] | null;
  leave_by_unix: number;
  baseline_leave_by_unix: number;
  buffer_sec: number;
  reason_short: string | null;
  status: PromiseStatus;
  nudges_sent: string[] | null;
  last_replan_at: string | null;
  replan_count: number;
  push_subscription_id: string | null;
  expo_device_id: string | null;
};

export const Route = createFileRoute("/api/public/hooks/arrival-watch-tick")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => tick(request),
      POST: async ({ request }) => tick(request),
    },
  },
});

async function tick(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  const holder = crypto.randomUUID();
  const { data: took, error: leaseErr } = await db.rpc("claim_job_lease", {
    p_job: "arrival-watch",
    p_holder: holder,
    p_ttl_seconds: LEASE_TTL_SEC,
  });

  if (leaseErr) {
    logger.error("arrival-watch lease failed", { error: leaseErr.message });
    return json({ ok: false, error: "lease unavailable" }, 500);
  }
  if (took !== true) return json({ ok: true, skipped: "locked" });

  const nowUnix = Math.floor(Date.now() / 1000);
  let replanned = 0;
  let notified = 0;
  let closed = 0;

  try {
    // Sweep promises whose arrival time is long gone. The batch below skips
    // them, so without this they sit in "watching" forever and keep showing
    // on the rider's card as if still live.
    const { data: expired } = await db
      .from("arrival_promises")
      .update({ status: "done" })
      .in("status", ["watching", "leave-now"])
      .lt("target_arrival_unix", nowUnix - 30 * 60)
      .select("id");
    closed += expired?.length ?? 0;

    const { data, error } = await db
      .from("arrival_promises")
      .select("*")
      .in("status", ["watching", "leave-now"])
      .gte("target_arrival_unix", nowUnix - 30 * 60)
      .order("leave_by_unix", { ascending: true })
      .limit(BATCH);

    if (error) {
      logger.error("arrival-watch fetch failed", { error: error.message });
      return json({ ok: false, error: error.message }, 500);
    }

    for (const raw of (data ?? []) as unknown as PromiseRow[]) {
      try {
        await processPromise(raw, nowUnix, (kind) => {
          if (kind === "replan") replanned++;
          else if (kind === "notify") notified++;
          else closed++;
        });
      } catch (e) {
        logger.warn("arrival-watch promise failed", {
          promiseId: raw.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    await db.rpc("release_job_lease", { p_job: "arrival-watch", p_holder: holder }).then(
      () => undefined,
      () => undefined,
    );
  }

  return json({ ok: true, replanned, notified, closed });
}

async function processPromise(
  row: PromiseRow,
  nowUnix: number,
  count: (kind: "replan" | "notify" | "close") => void,
) {
  // Past its arrival time: the promise is spent either way.
  if (nowUnix > row.target_arrival_unix) {
    await db.from("arrival_promises").update({ status: "done" }).eq("id", row.id);
    count("close");
    return;
  }

  const lastReplanUnix = row.last_replan_at
    ? Math.floor(new Date(row.last_replan_at).getTime() / 1000)
    : null;

  let leaveByUnix = row.leave_by_unix;
  let ladder = row.ladder_json ?? [];
  let bufferSec = row.buffer_sec;
  let reasonShort = row.reason_short;
  let unmakeable = row.status === "missed";
  let earliestArrivalUnix: number | null = null;
  let planPatch: Record<string, unknown> | null = null;

  if (isReplanDue({ nowUnix, leaveByUnix: row.leave_by_unix, lastReplanUnix })) {
    const plan = await computePromisePlan({
      origin: { lat: row.origin_lat, lng: row.origin_lng, label: row.origin_label },
      destination: {
        lat: row.destination_lat,
        lng: row.destination_lng,
        label: row.destination_label,
      },
      targetArrivalUnix: row.target_arrival_unix,
      margin: row.margin_pref,
    });

    unmakeable = plan.unmakeable;
    earliestArrivalUnix = plan.earliestArrivalUnix;
    ladder = plan.ladder;
    bufferSec = plan.bufferSec;
    reasonShort = plan.reasonShort;
    if (plan.leaveByUnix != null) leaveByUnix = plan.leaveByUnix;
    planPatch = planSnapshot(plan.itinerary);
    count("replan");
  }

  const status = promiseStatusFor(
    {
      leaveByUnix,
      targetArrivalUnix: row.target_arrival_unix,
      status: row.status,
      unmakeable,
    },
    nowUnix,
  );

  const nudge = nextNudge(
    {
      leaveByUnix,
      baselineLeaveByUnix: row.baseline_leave_by_unix,
      targetArrivalUnix: row.target_arrival_unix,
      status,
      nudgesSent: row.nudges_sent ?? [],
      unmakeable,
    },
    nowUnix,
  );

  const nudgesSent = [...(row.nudges_sent ?? [])];
  if (nudge) nudgesSent.push(nudge);

  // Persist before sending: a push we fail to record is worse than one we
  // record and fail to send — the rider still sees the card either way.
  await db
    .from("arrival_promises")
    .update({
      ...(planPatch ? { plan_json: JSON.parse(JSON.stringify(planPatch)) } : {}),
      ladder_json: JSON.parse(JSON.stringify(ladder)),
      leave_by_unix: leaveByUnix,
      buffer_sec: bufferSec,
      reason_short: reasonShort,
      status,
      nudges_sent: nudgesSent,
      ...(planPatch
        ? { last_replan_at: new Date().toISOString(), replan_count: (row.replan_count ?? 0) + 1 }
        : {}),
    })
    .eq("id", row.id);

  if (!nudge) return;

  const routes = (row.plan_json?.legs ?? [])
    .map((l) => l.routeShort)
    .filter((r): r is string => Boolean(r));

  const copy = nudgeCopy({
    kind: nudge,
    destinationLabel: row.destination_label,
    targetArrivalUnix: row.target_arrival_unix,
    leaveByUnix,
    routes,
    reasonShort,
    earliestArrivalUnix,
  });

  const sent = await dispatch(row, nudge, copy);
  if (sent) count("notify");
}

async function dispatch(
  row: PromiseRow,
  kind: NudgeKind,
  copy: { title: string; body: string },
): Promise<boolean> {
  const receipt = await deliver(
    { subscriptionId: row.push_subscription_id, expoDeviceId: row.expo_device_id },
    {
      category: "arrival-promise",
      title: copy.title,
      body: copy.body,
      tag: `aloya-promise-${row.id}-${kind}`,
      url: `/trips?promise=${row.id}`,
      requireInteraction: kind === "now" || kind === "unmakeable",
      data: { promiseId: row.id, nudge: kind },
    },
  );
  return receipt.ok;
}
