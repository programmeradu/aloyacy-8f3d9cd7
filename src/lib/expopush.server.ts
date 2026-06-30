// Server-side Expo Push delivery.
//
// Sends a batch of messages to https://exp.host/--/api/v2/push/send and
// surfaces "DeviceNotRegistered" tickets so the caller can prune stale
// tokens. Expo's service handles APNs/FCM fanout for us.

export type ExpoPushMessage = {
  to: string; // ExponentPushToken[...]
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  badge?: number;
  ttl?: number;
};

export type ExpoSendResult = {
  ok: number;
  expiredTokens: string[];
  errors: string[];
};

type Ticket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

const ENDPOINT = "https://exp.host/--/api/v2/push/send";

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoSendResult> {
  const out: ExpoSendResult = { ok: 0, expiredTokens: [], errors: [] };
  if (messages.length === 0) return out;

  // Expo accepts up to 100 messages per request.
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  for (const chunk of chunks) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
          "content-type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    if (!res.ok) {
      out.errors.push(`Expo push HTTP ${res.status}`);
      continue;
    }
    const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
    const tickets = json?.data ?? [];
    tickets.forEach((t, idx) => {
      if (t.status === "ok") {
        out.ok++;
      } else {
        out.errors.push(t.message);
        if (t.details?.error === "DeviceNotRegistered") {
          out.expiredTokens.push(chunk[idx].to);
        }
      }
    });
  }
  return out;
}
