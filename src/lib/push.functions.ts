import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWebPush, type WebPushPayload } from "./webpush.server";
import { VAPID_PUBLIC_KEY } from "./vapid";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
  auth: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
});

const saveSchema = z.object({
  deviceId: z.string().min(8).max(128),
  subscription: subscriptionSchema,
  userAgent: z.string().max(500).optional(),
});

export const saveSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          device_id: data.deviceId,
          endpoint: data.subscription.endpoint,
          p256dh: data.subscription.p256dh,
          auth: data.subscription.auth,
          user_agent: data.userAgent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) {
      console.error("[push] save failed", error);
      throw new Error("Could not save subscription");
    }
    return { ok: true as const };
  });

const removeSchema = z.object({ endpoint: z.string().url().max(2048) });

export const removeSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) => removeSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint);
    if (error) {
      console.error("[push] remove failed", error);
    }
    return { ok: true as const };
  });

const sendTestSchema = z.object({ deviceId: z.string().min(8).max(128) });

async function dispatchToDevice(deviceId: string, payload: WebPushPayload) {
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:notifications@aloya.app";
  if (!priv) throw new Error("VAPID_PRIVATE_KEY is not configured");

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("device_id", deviceId);

  if (error) throw new Error(error.message);
  if (!subs || subs.length === 0) return { sent: 0, expired: 0 };

  let sent = 0;
  let expired = 0;
  for (const s of subs) {
    const r = await sendWebPush({
      subscription: { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      payload,
      vapidPublicKey: VAPID_PUBLIC_KEY,
      vapidPrivateKey: priv,
      vapidSubject: sub,
    });
    if (r.ok) sent++;
    else if (r.expired) {
      expired++;
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    } else {
      console.warn("[push] send failed", r.status, r.error);
    }
  }
  return { sent, expired };
}

export const sendTestPush = createServerFn({ method: "POST" })
  .inputValidator((input) => sendTestSchema.parse(input))
  .handler(async ({ data }) => {
    return dispatchToDevice(data.deviceId, {
      title: "Aloya",
      body: "Notifications are on. We will only ping you when it matters.",
      tag: "aloya-test",
      url: "/",
    });
  });

const tripAlertSchema = z.object({
  deviceId: z.string().min(8).max(128),
  kind: z.enum([
    "board-soon",
    "hurry-soft",
    "hurry-urgent",
    "at-stop",
    "confirm-onboard",
    "missed-bus",
    "alight-soon",
    "press-stop",
    "arrived",
    "delayed",
  ]),
  routeShort: z.string().max(16).optional(),
  stopName: z.string().max(160).optional(),
  minutes: z.number().min(0).max(120).optional(),
  url: z.string().max(512).optional(),
});

export const sendTripAlert = createServerFn({ method: "POST" })
  .inputValidator((input) => tripAlertSchema.parse(input))
  .handler(async ({ data }) => {
    const bus = data.routeShort ? `BUS ${data.routeShort}` : "Your bus";
    const stop = data.stopName ?? "your stop";
    const min = data.minutes ?? 0;
    const map: Record<string, { title: string; body: string; requireInteraction?: boolean }> = {
      "board-soon": {
        title: `${bus} arrives in ${min} min`,
        body: `Head to ${stop}.`,
      },
      "hurry-soft": {
        title: `Pick up the pace`,
        body: `${bus} reaches ${stop} in ${min} min.`,
      },
      "hurry-urgent": {
        title: `Hurry — ${bus} is arriving`,
        body: `Only ${min} min to ${stop}.`,
        requireInteraction: true,
      },
      "at-stop": {
        title: `You're at ${stop}`,
        body: `Wait near the curb. ${bus} arrives in ${min} min.`,
      },
      "confirm-onboard": {
        title: `On ${bus}?`,
        body: `Tap to confirm you're aboard.`,
        requireInteraction: true,
      },
      "missed-bus": {
        title: `${bus} has left ${stop}`,
        body: `Tap to find the next ride.`,
        requireInteraction: true,
      },
      "alight-soon": {
        title: `${stop} in ${min} min`,
        body: "Get ready to press the stop button.",
        requireInteraction: true,
      },
      "press-stop": {
        title: "Press the stop button now",
        body: `Next stop: ${stop}.`,
        requireInteraction: true,
      },
      arrived: {
        title: "You have arrived",
        body: "Step off at this stop.",
      },
      delayed: {
        title: `${bus} is running late`,
        body: `New arrival in ~${min} min at ${stop}.`,
      },
    };
    const m = map[data.kind];
    return dispatchToDevice(data.deviceId, {
      title: m.title,
      body: m.body,
      tag: `aloya-${data.kind}`,
      url: data.url ?? "/",
      requireInteraction: m.requireInteraction,
    });
  });
