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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      const context = { method: request.method, path: new URL(request.url).pathname };
      log.error("unhandled request failure", error, context);
      void captureException(error, context);
      return brandedErrorResponse();
    }
  },
};
