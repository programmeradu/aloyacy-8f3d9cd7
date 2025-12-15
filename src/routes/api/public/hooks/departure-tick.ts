// Cron tick (every 2 min). Two-phase:
//  1) Look-ahead pass: rows due within next 60 min and not yet adjusted →
//     fetch current weather + recent route delays, compute extra buffer,
//     shift remind_at_unix earlier if conditions warrant. Mark last_check_at.
//  2) Send pass: rows whose remind_at_unix has now arrived → dispatch push.
//
// Auth: gated by the project anon key in the `apikey` header.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWebPush } from "@/lib/webpush.server";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
import {
  computeLeaveAdjustment,
  fetchCurrentWeather,
  type DelaySample,
  type WeatherCondition,
  type WeatherCoupling,
} from "@/lib/leave-time-adjuster";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function guard(request: Request) {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
  const provided = request.headers.get("apikey");
  if (expected && provided !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return null;
}

type PlanShape = {
  fromLabel?: string;
  toLabel?: string;
  fromLat?: number;
  fromLng?: number;
  legs?: Array<{ kind?: string; routeId?: string; routeShort?: string }>;
  // Stored by phase-1 so phase-2 can surface it in the push body.
  adjustment?: {
    extraSec: number;
    reasonShort: string | null;
    weather: WeatherCondition;
    originalRemindAtUnix: number;
  };
};

const LOOKAHEAD_SEC = 60 * 60; // 1h

export const Route = createFileRoute("/api/public/hooks/departure-tick")({
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

  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:notifications@aloya.app";
  if (!priv) return json({ ok: false, error: "VAPID_PRIVATE_KEY missing" }, 500);

  const nowUnix = Math.floor(Date.now() / 1000);

  // ============ Phase 1: look-ahead adjustment ============
  let adjusted = 0;
  try {
    const { data: upcoming } = await supabaseAdmin
      .from("scheduled_departures")
      .select("id, plan_json, remind_at_unix, last_check_at")
      .eq("status", "scheduled")
      .gt("remind_at_unix", nowUnix)
      .lte("remind_at_unix", nowUnix + LOOKAHEAD_SEC)
      .is("last_check_at", null)
      .limit(50);

    for (const row of upcoming ?? []) {
      const plan = (row.plan_json ?? {}) as PlanShape;
      const routeIds = (plan.legs ?? [])
        .filter((l) => l.kind === "ride" && l.routeId)
        .map((l) => l.routeId as string);

      const weather: WeatherCondition =
        plan.fromLat != null && plan.fromLng != null
          ? await fetchCurrentWeather(plan.fromLat, plan.fromLng)
          : "unknown";

      const [delaysRes, couplingRes] = await Promise.all([
        routeIds.length
          ? supabaseAdmin
              .from("delay_stats")
              .select("route_id, mean_delay_sec, sample_count")
              .in("route_id", routeIds)
              .gte("sample_count", 3)
              .limit(64)
          : Promise.resolve({ data: [] as DelaySample[] }),
        routeIds.length && weather !== "clear" && weather !== "cloudy" && weather !== "unknown"
          ? supabaseAdmin
              .from("weather_delay_coupling")
              .select("route_id, condition, mean_extra_delay_sec, sample_count")
              .in("route_id", routeIds)
              .eq("condition", weather)
              .gte("sample_count", 3)
              .limit(64)
          : Promise.resolve({ data: [] as WeatherCoupling[] }),
      ]);

      const adj = computeLeaveAdjustment({
        routeIds,
        weather,
        delays: (delaysRes.data ?? []) as DelaySample[],
        weatherCoupling: (couplingRes.data ?? []) as WeatherCoupling[],
      });

      const newRemind = adj.extraSec > 0 ? row.remind_at_unix - adj.extraSec : row.remind_at_unix;
      const nextPlan: PlanShape = {
        ...plan,
        adjustment: {
          extraSec: adj.extraSec,
          reasonShort: adj.reasonShort,
          weather: adj.weather,
          originalRemindAtUnix: row.remind_at_unix,
        },
      };

      await supabaseAdmin
        .from("scheduled_departures")
        .update({
          remind_at_unix: newRemind,
          plan_json: JSON.parse(JSON.stringify(nextPlan)),
          last_check_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (adj.extraSec > 0) adjusted++;
    }
  } catch (e) {
    console.warn("[departure-tick] phase1 adjust failed", e);
  }

  // ============ Phase 2: send ============
  const { data: due, error } = await supabaseAdmin
    .from("scheduled_departures")
    .select("id, user_id, arrive_by_unix, remind_at_unix, plan_json, push_subscription_id")
    .eq("status", "scheduled")
    .lte("remind_at_unix", nowUnix)
    .limit(100);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!due || due.length === 0) return json({ ok: true, processed: 0, adjusted });

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const plan = (row.plan_json ?? {}) as PlanShape;
    const firstRoute = plan.legs?.find((l) => l.routeShort)?.routeShort;
    const minutesUntil = Math.max(0, Math.round((row.arrive_by_unix - nowUnix) / 60));
    const adj = plan.adjustment;
    const bodyExtra =
      adj && adj.extraSec >= 60 && adj.reasonShort
        ? ` ${adj.reasonShort}.`
        : "";
    const payload = {
      title: `Time to head out${firstRoute ? ` — BUS ${firstRoute}` : ""}`,
      body: `Leave now to reach ${plan.toLabel ?? "your destination"} on time (~${minutesUntil} min).${bodyExtra}`,
      tag: `aloya-depart-${row.id}`,
      url: "/trips",
      requireInteraction: true,
    } as const;

    let subsRows: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
    if (row.push_subscription_id) {
      const { data } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("id", row.push_subscription_id);
      subsRows = data ?? [];
    }

    if (subsRows.length === 0) {
      await supabaseAdmin
        .from("scheduled_departures")
        .update({
          status: "notified",
          notified_at: new Date().toISOString(),
          last_check_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      continue;
    }

    let anyOk = false;
    for (const s of subsRows) {
      try {
        const r = await sendWebPush({
          subscription: { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          payload,
          vapidPublicKey: VAPID_PUBLIC_KEY,
          vapidPrivateKey: priv,
          vapidSubject: sub,
          urgency: "high",
        });
        if (r.ok) {
          anyOk = true;
          sent++;
        } else if (r.expired) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          failed++;
        } else {
          failed++;
        }
      } catch (e) {
        console.warn("[departure-tick] send failed", e);
        failed++;
      }
    }

    await supabaseAdmin
      .from("scheduled_departures")
      .update({
        status: anyOk ? "notified" : "scheduled",
        notified_at: anyOk ? new Date().toISOString() : null,
        last_check_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return json({ ok: true, processed: due.length, sent, failed, adjusted });
}
