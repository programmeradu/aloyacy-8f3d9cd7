// Unified notification delivery.
//
// Every rider-facing push in Aloya goes through `deliver()`. Before this
// module each feature (arrival promises, departure reminders, trip alerts)
// owned its own copy of the same three chores — look up subscriptions, fan out
// to Web Push and Expo, prune dead tokens — and each one drifted: some
// retried, some didn't; some cleaned up expired endpoints, some leaked them;
// none of them could tell you what had actually been delivered.
//
// The rules this layer enforces, once, for everyone:
//
//   * Audience resolution — address a rider by device, by stored subscription
//     id, or both. Duplicate endpoints across those paths collapse to one send
//     so a rider on two surfaces never gets the same alert twice.
//   * Retry — a transient failure (network error, 429, 5xx) is retried with a
//     short backoff. A 404/410 is not: that endpoint is gone for good.
//   * Cleanup — expired Web Push endpoints and unregistered Expo tokens are
//     deleted as they're discovered, so the next send is cheaper.
//   * Ledger — each attempt is recorded in `notification_deliveries` when that
//     table exists. Recording is best-effort and never blocks a send.
//
// Callers stay declarative: describe the audience and the message, read the
// receipt.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** The delivery ledger is newer than the generated types. */
const ledgerDb = supabaseAdmin as unknown as SupabaseClient;
import { sendWebPush } from "@/lib/webpush.server";
import { sendExpoPush, type ExpoPushMessage } from "@/lib/expopush.server";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
import { createLogger, serializeError } from "@/lib/logger";

const log = createLogger("notify");

/** Feature that produced the notification. Drives the Android channel. */
export type NotifyCategory =
  | "arrival-promise"
  | "departure"
  | "trip-alert"
  | "group-trip"
  | "service-alert";

const ANDROID_CHANNEL: Record<NotifyCategory, string> = {
  "arrival-promise": "arrival-promises",
  departure: "departures",
  "trip-alert": "trip-alerts",
  "group-trip": "group-trips",
  "service-alert": "service-alerts",
};

export type NotifyAudience = {
  /** Device that owns the subscriptions (web and native share this id). */
  deviceId?: string | null;
  /** A specific stored web push subscription row. */
  subscriptionId?: string | null;
  /** Device id whose Expo tokens should receive the message. */
  expoDeviceId?: string | null;
};

export type NotifyMessage = {
  category: NotifyCategory;
  title: string;
  body: string;
  /** Deep link opened when the rider taps through. */
  url?: string;
  /** Collapse key — a newer push with the same tag replaces the older one. */
  tag: string;
  /** Keeps the notification on screen until acted on. Urgent nudges only. */
  requireInteraction?: boolean;
  /** Extra payload handed to the client handler. */
  data?: Record<string, unknown>;
};

export type NotifyReceipt = {
  /** At least one channel accepted the message. */
  ok: boolean;
  sent: number;
  failed: number;
  /** Endpoints/tokens deleted because the far end no longer exists. */
  pruned: number;
  /** Targets skipped because another target in this send matched them. */
  duplicates: number;
  channels: { web: number; native: number };
};

type WebTarget = { endpoint: string; p256dh: string; auth: string };

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

function emptyReceipt(): NotifyReceipt {
  return { ok: false, sent: 0, failed: 0, pruned: 0, duplicates: 0, channels: { web: 0, native: 0 } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 404/410 mean the subscription is gone; anything else may work next time. */
function isRetryable(status: number): boolean {
  if (status === 404 || status === 410) return false;
  return status === 0 || status === 429 || status >= 500;
}

async function resolveWebTargets(audience: NotifyAudience): Promise<{
  targets: WebTarget[];
  duplicates: number;
}> {
  const rows: WebTarget[] = [];

  if (audience.deviceId) {
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("device_id", audience.deviceId);
    rows.push(...((data ?? []) as WebTarget[]));
  }

  if (audience.subscriptionId) {
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("id", audience.subscriptionId);
    rows.push(...((data ?? []) as WebTarget[]));
  }

  const seen = new Set<string>();
  const targets: WebTarget[] = [];
  let duplicates = 0;
  for (const row of rows) {
    if (seen.has(row.endpoint)) {
      duplicates++;
      continue;
    }
    seen.add(row.endpoint);
    targets.push(row);
  }
  return { targets, duplicates };
}

async function resolveExpoTokens(audience: NotifyAudience): Promise<string[]> {
  const deviceId = audience.expoDeviceId ?? audience.deviceId;
  if (!deviceId) return [];
  const { data } = await supabaseAdmin
    .from("expo_push_tokens")
    .select("expo_token")
    .eq("device_id", deviceId);
  return Array.from(new Set((data ?? []).map((t) => t.expo_token as string)));
}

async function pruneWebEndpoint(endpoint: string): Promise<void> {
  await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .then(
      () => undefined,
      () => undefined,
    );
}

async function deliverWeb(
  targets: WebTarget[],
  message: NotifyMessage,
  receipt: NotifyReceipt,
): Promise<void> {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey || targets.length === 0) return;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@aloya.cy";

  const payload = {
    title: message.title,
    body: message.body,
    tag: message.tag,
    url: message.url,
    requireInteraction: message.requireInteraction ?? false,
    category: message.category,
    ...(message.data ?? {}),
  };

  for (const target of targets) {
    let delivered = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let status = 0;
      let expired = false;
      try {
        const res = await sendWebPush({
          subscription: target,
          payload,
          vapidPublicKey: VAPID_PUBLIC_KEY,
          vapidPrivateKey: privateKey,
          vapidSubject: subject,
          urgency: message.requireInteraction ? "high" : "normal",
        });
        if (res.ok) {
          delivered = true;
          break;
        }
        status = res.status;
        expired = res.expired === true;
      } catch (e) {
        log.warn("web push threw", { category: message.category, ...serializeError(e) });
      }

      if (expired || !isRetryable(status)) {
        if (expired || status === 404 || status === 410) {
          await pruneWebEndpoint(target.endpoint);
          receipt.pruned++;
        }
        break;
      }
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }

    if (delivered) {
      receipt.sent++;
      receipt.channels.web++;
    } else {
      receipt.failed++;
    }
  }
}

async function deliverNative(
  tokens: string[],
  message: NotifyMessage,
  receipt: NotifyReceipt,
): Promise<void> {
  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    sound: "default",
    channelId: ANDROID_CHANNEL[message.category],
    priority: message.requireInteraction ? "high" : "default",
    data: {
      category: message.category,
      tag: message.tag,
      url: message.url,
      ...(message.data ?? {}),
    },
  }));

  try {
    const res = await sendExpoPush(messages);
    receipt.sent += res.ok;
    receipt.channels.native += res.ok;
    receipt.failed += Math.max(0, tokens.length - res.ok - res.expiredTokens.length);
    for (const stale of res.expiredTokens) {
      await supabaseAdmin.from("expo_push_tokens").delete().eq("expo_token", stale);
      receipt.pruned++;
    }
    if (res.errors.length > 0) {
      log.warn("expo push errors", { category: message.category, errors: res.errors.slice(0, 3) });
    }
  } catch (e) {
    receipt.failed += tokens.length;
    log.warn("expo push threw", { category: message.category, ...serializeError(e) });
  }
}

/**
 * Record the attempt. The ledger table is optional — a project that hasn't
 * applied the migration yet still delivers, it just has no history.
 */
async function record(
  audience: NotifyAudience,
  message: NotifyMessage,
  receipt: NotifyReceipt,
): Promise<void> {
  try {
    await ledgerDb.from("notification_deliveries").insert({
      category: message.category,
      tag: message.tag,
      title: message.title,
      body: message.body,
      url: message.url ?? null,
      device_id: audience.expoDeviceId ?? audience.deviceId ?? null,
      sent: receipt.sent,
      failed: receipt.failed,
      pruned: receipt.pruned,
    });
  } catch {
    // Ledger is advisory; never let it fail a send.
  }
}

/** Fan a single notification out to every surface the rider has registered. */
export async function deliver(
  audience: NotifyAudience,
  message: NotifyMessage,
): Promise<NotifyReceipt> {
  const receipt = emptyReceipt();

  const [{ targets, duplicates }, tokens] = await Promise.all([
    resolveWebTargets(audience),
    resolveExpoTokens(audience),
  ]);
  receipt.duplicates = duplicates;

  if (targets.length === 0 && tokens.length === 0) return receipt;

  await deliverWeb(targets, message, receipt);
  await deliverNative(tokens, message, receipt);

  receipt.ok = receipt.sent > 0;
  await record(audience, message, receipt);
  return receipt;
}
