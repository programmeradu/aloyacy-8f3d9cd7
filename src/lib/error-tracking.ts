// Error tracking for the deployed Worker.
//
// The structured logger (src/lib/logger.ts) makes failures searchable in the
// platform log viewer, but a log line has no ownership, no grouping and no
// alerting. This module ships the same failures to a Sentry-compatible
// ingestion endpoint so unhandled SSR errors surface as grouped issues.
//
// No SDK: the official Sentry packages assume a Node or browser host. The
// envelope format is a stable, documented wire protocol, so a ~40 line
// `fetch` POST is both smaller and safer inside a Cloudflare Worker.
//
// Disabled by default — with `SENTRY_DSN` unset, `captureException` is a
// no-op and the app behaves exactly as before.

import { incrementCounter } from "./metrics";

type Dsn = { url: string; key: string };

/**
 * Parses `https://<key>@<host>/<projectId>` into the envelope endpoint.
 * Returns `undefined` for an absent or malformed DSN rather than throwing:
 * a misconfigured tracker must never take down request handling.
 */
export function parseDsn(dsn: string | undefined): Dsn | undefined {
  if (!dsn) return undefined;
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\//, "");
    if (!parsed.username || !projectId) return undefined;
    return {
      url: `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`,
      key: parsed.username,
    };
  } catch {
    return undefined;
  }
}

function describe(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) {
    return { type: error.name, value: error.message, stack: error.stack };
  }
  return { type: "UnknownError", value: String(error) };
}

/** Serialises one exception event into a Sentry envelope body. */
export function buildEnvelope(
  error: unknown,
  context: Record<string, unknown>,
  now: number = Date.now(),
): string {
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const sentAt = new Date(now).toISOString();
  const { type, value, stack } = describe(error);
  const event = {
    event_id: eventId,
    timestamp: now / 1000,
    platform: "javascript",
    level: "error",
    logger: "ssr",
    environment: process.env["NODE_ENV"] ?? "production",
    exception: { values: [{ type, value, stacktrace: stack ? { frames: [] } : undefined }] },
    extra: { ...context, stack },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

export type Fetcher = typeof fetch;

/**
 * Reports one error out-of-band. Never throws and never rejects: callers are
 * already on a failure path and must keep serving the branded error page.
 */
export async function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
  deps: { dsn?: string; fetcher?: Fetcher } = {},
): Promise<boolean> {
  // Counted before the DSN check: an instance with no DSN configured still
  // needs its error rate visible on the metrics scrape.
  incrementCounter(
    "aloya_errors_total",
    { scope: typeof context["scope"] === "string" ? context["scope"] : "unknown" },
    1,
    "Errors passed to captureException, by scope.",
  );
  const dsn = parseDsn(deps.dsn ?? process.env["SENTRY_DSN"]);
  if (!dsn) return false;
  const send = deps.fetcher ?? fetch;
  try {
    await send(dsn.url, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=aloya-worker/1.0`,
      },
      body: buildEnvelope(error, context),
    });
    return true;
  } catch {
    return false;
  }
}
