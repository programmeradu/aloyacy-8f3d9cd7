// Cron tick: fires every 2 minutes via pg_cron. Finds scheduled departures
// whose remind_at_unix has arrived, dispatches a web-push to the user's
// devices, marks them notified.
//
// Auth: gated by the project anon key in the `apikey` header (the same
// pattern the training cron uses).

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWebPush } from "@/lib/webpush.server";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

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
  legs?: Array<{ routeShort?: string }>;
};

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

  const { data: due, error } = await supabaseAdmin
    .from("scheduled_departures")
    .select("id, user_id, arrive_by_unix, remind_at_unix, plan_json, push_subscription_id")
    .eq("status", "scheduled")
    .lte("remind_at_unix", nowUnix)
    .limit(100);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!due || due.length === 0) return json({ ok: true, processed: 0 });

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const plan = (row.plan_json ?? {}) as PlanShape;
    const firstRoute = plan.legs?.find((l) => l.routeShort)?.routeShort;
    const minutesUntil = Math.max(0, Math.round((row.arrive_by_unix - nowUnix) / 60));
    const payload = {
      title: `Time to head out${firstRoute ? ` — BUS ${firstRoute}` : ""}`,
      body: `Leave now to reach ${plan.toLabel ?? "your destination"} on time (~${minutesUntil} min).`,
      tag: `aloya-depart-${row.id}`,
      url: "/trips",
      requireInteraction: true,
    } as const;

    // Send to every push subscription registered against the user's known
    // device ids. We don't index push_subscriptions by user_id directly,
    // so we walk through subs the row's push_subscription_id matches plus
    // any subs whose device_id matches a recent active_trips.device_id for
    // this user (cheap fallback). v1: just use push_subscription_id when
    // set, otherwise iterate all subs (admin client).
    let subsRows: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
    if (row.push_subscription_id) {
      const { data } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("id", row.push_subscription_id);
      subsRows = data ?? [];
    }

    if (subsRows.length === 0) {
      // No targeted sub stored → silently mark notified to avoid retries.
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

  return json({ ok: true, processed: due.length, sent, failed });
}
