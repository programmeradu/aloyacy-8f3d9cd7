import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { captureException } from "./lib/error-tracking";
import { renderErrorPage } from "./lib/error-page";
import { createLogger } from "./lib/logger";

// Structured, one-line-JSON logs so SSR failures are searchable in the
// platform log viewer by `scope` and `level` rather than by eyeballing stacks.
// The same failures are mirrored to the error tracker (no-op without
// `SENTRY_DSN`) so they group into alertable issues instead of log noise.
const log = createLogger("ssr");

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  const error = consumeLastCapturedError() ?? new Error(body);
  log.error("catastrophic SSR failure", error, { status: response.status });
  void captureException(error, {
    status: response.status,
    method: request.method,
    path: new URL(request.url).pathname,
  });
  return brandedErrorResponse();
}

import { setWorkerEnv } from "./lib/worker-env";
import { runScheduled } from "./lib/cron-schedule";
import { serveMedia } from "./lib/db/storage";

const server = {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    setWorkerEnv(env);
    const workerEnv = env as { ASSETS?: { fetch: typeof fetch } };
    const url = new URL(request.url);

    // 1. Public R2 media (/media/<bucket>/<path>, see src/lib/db/storage.ts).
    if (url.pathname.startsWith("/media/") && (request.method === "GET" || request.method === "HEAD")) {
      const media = await serveMedia(url.pathname);
      if (media) return media;
    }

    // 2. Schedule data: the nightly ingest writes fresh shards to R2
    // (schedule/...); the snapshot bundled in ASSETS is the fallback below.
    if (url.pathname.startsWith("/data/schedule/") && (request.method === "GET" || request.method === "HEAD")) {
      const fromR2 = await serveMedia(url.pathname.replace(/^\/data\/schedule\//, "/media/schedule/"));
      if (fromR2 && fromR2.ok) return fromR2;
    }

    // If request is a static asset or data file, let Cloudflare Assets binding attempt to serve it first
    if (
      workerEnv?.ASSETS &&
      (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname.startsWith("/data/") ||
        url.pathname.startsWith("/assets/") ||
        /\.[a-z0-9]+$/i.test(url.pathname))
    ) {
      try {
        const assetRes = await workerEnv.ASSETS.fetch(request);
        if (assetRes.status >= 200 && assetRes.status < 400) {
          return assetRes;
        }
      } catch (assetErr) {
        log.warn("asset fetch error", { path: url.pathname, error: String(assetErr) });
      }
    }


    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);

      // If SSR handler returned 404, fallback to ASSETS if available
      if (
        response.status === 404 &&
        workerEnv?.ASSETS &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        try {
          const fallbackRes = await workerEnv.ASSETS.fetch(request);
          if (fallbackRes.status >= 200 && fallbackRes.status < 400) {
            return fallbackRes;
          }
        } catch {}
      }

      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      const context = { method: request.method, path: url.pathname };
      log.error("unhandled request failure", error, context);
      void captureException(error, context);
      return brandedErrorResponse();
    }
  },

  /**
   * Cron triggers (wrangler `triggers.crons`, see src/lib/cron-schedule.ts).
   * Each job is a POST to its hook through this same fetch handler, in-process,
   * with `Authorization: Bearer ${CRON_SECRET}`.
   */
  async scheduled(
    event: { cron: string; scheduledTime: number },
    env: unknown,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ): Promise<void> {
    setWorkerEnv(env);
    await runScheduled(
      (request, e, c) => server.fetch(request, e, c),
      event,
      env as Record<string, unknown>,
      ctx,
    );
  },
};

export default server;
