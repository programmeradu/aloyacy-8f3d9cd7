// A2 v1 — resolve actual arrivals from "a later stop of the same trip was
// seen after this stop's predicted time". Vehicle-cross geofence needs
// persisted vehicle pings; that is A2 v2. Inferred only, source='inferred'.

import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow } from "@aloya/core/cy-time";

const db = supabaseAdmin as unknown as SupabaseClient;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, X-Cron-Secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function guard(request: Request) {
  const expected =
    import.meta.env.VITE_CUSTOM_SUPABASE_ANON_KEY || process.env.CUSTOM_SUPABASE_ANON_KEY;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("apikey");
  const validApi = expected && provided === expected;
  const validCron = bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
  if (!validApi && !validCron) return json({ ok: false, error: "Unauthorized" }, 401);
  return null;
}

type Observed = {
  trip_id: string;
  stop_id: string;
  route_id: string;
  last_predicted_arrival: string;
  last_seen_at: string;
};

export async function resolveInferredArrivals(nowMs = Date.now()): Promise<number> {
  const from = new Date(nowMs - 45 * 60_000).toISOString();
  const until = new Date(nowMs - 90_000).toISOString();
  const { data, error } = await db
    .from("observed_arrivals")
    .select("trip_id, stop_id, route_id, last_predicted_arrival, last_seen_at")
    .is("passed_at", null)
    .gt("last_predicted_arrival", from)
    .lt("last_predicted_arrival", until)
    .limit(800);
  if (error || !data) return 0;

  const byTrip = new Map<string, Observed[]>();
  for (const row of data as Observed[]) {
    const arr = byTrip.get(row.trip_id) ?? [];
    arr.push(row);
    byTrip.set(row.trip_id, arr);
  }

  let resolved = 0;
  for (const rows of byTrip.values()) {
    if (rows.length < 2) continue;
    rows.sort(
      (a, b) =>
        new Date(a.last_predicted_arrival).getTime() - new Date(b.last_predicted_arrival).getTime(),
    );
    for (let i = 0; i < rows.length - 1; i++) {
      const here = rows[i]!;
      const later = rows.slice(i + 1).find(
        (r) => new Date(r.last_seen_at).getTime() > new Date(here.last_predicted_arrival).getTime(),
      );
      if (!later) continue;
      const actual = here.last_predicted_arrival;
      const { hour, dow } = cyHourDow(new Date(actual).getTime());
      const { error: insErr } = await db.from("arrival_truth").upsert(
        {
          trip_id: here.trip_id,
          stop_id: here.stop_id,
          route_id: here.route_id,
          actual_arrival: actual,
          source: "inferred",
          evidence: { later_stop_id: later.stop_id, later_seen_at: later.last_seen_at },
          hour_of_day: hour,
          day_of_week: dow,
        },
        { onConflict: "trip_id,stop_id" },
      );
      if (insErr) continue;
      const { error: updErr } = await db
        .from("observed_arrivals")
        .update({ passed_at: actual })
        .eq("trip_id", here.trip_id)
        .eq("stop_id", here.stop_id)
        .is("passed_at", null);
      if (!updErr) resolved += 1;
    }
  }
  return resolved;
}

async function runFromRequest(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const resolved = await resolveInferredArrivals();
    return json({ ok: true, resolved });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "resolve failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/hooks/resolve-arrivals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => await runFromRequest(request),
      POST: async ({ request }) => await runFromRequest(request),
    },
  },
});
