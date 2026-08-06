// Shared request-validation boundary for the public HTTP API.
//
// Every `/api/public/*` handler is unauthenticated and reachable from the
// open internet, so each one parses its input with a Zod schema before any
// work happens. This module keeps that uniform: one JSON reader, one query
// reader, one error shape (`{ error, details }` with HTTP 400), so a bad
// payload can never reach a server function, a database call, or a paid
// upstream API.
//
// Handlers stay readable because the failure branch is a plain early return:
//
//   const parsed = await parseJsonBody(request, Body, CORS);
//   if (!parsed.ok) return parsed.response;
//   ... use parsed.data (fully typed)

import type { z } from "zod";

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

type Headers_ = Record<string, string>;

const JSON_HEADER = { "Content-Type": "application/json" };

/** JSON response helper that always carries the caller's CORS headers. */
export function jsonResponse(status: number, body: unknown, headers: Headers_ = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADER, ...headers },
  });
}

/** 400 with a stable machine-readable shape. */
export function badRequest(message: string, details: string[], headers: Headers_ = {}): Response {
  return jsonResponse(400, { error: message, details }, headers);
}

/**
 * Flatten a ZodError into short "path: message" strings, capped so a hostile
 * payload with hundreds of bad fields can't inflate our response body.
 */
export function zodDetails(error: z.ZodError, max = 8): string[] {
  return error.issues.slice(0, max).map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Run a schema over an already-decoded value. */
export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  headers: Headers_ = {},
): Parsed<z.infer<S>> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    response: badRequest("Invalid request", zodDetails(result.error), headers),
  };
}

/** Read + validate a JSON request body. Malformed JSON is a 400, not a 500. */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  headers: Headers_ = {},
): Promise<Parsed<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: badRequest("Invalid JSON body", ["body: expected valid JSON"], headers),
    };
  }
  return parseWith(schema, raw, headers);
}

/**
 * Validate query parameters. Repeated keys collapse to the last value, which
 * matches how handlers read them with `searchParams.get`. Use `z.coerce.*` in
 * the schema for numbers/booleans.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  input: URL | URLSearchParams | string,
  schema: S,
  headers: Headers_ = {},
): Parsed<z.infer<S>> {
  const params =
    input instanceof URLSearchParams
      ? input
      : input instanceof URL
        ? input.searchParams
        : new URL(input).searchParams;
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) record[key] = value;
  return parseWith(schema, record, headers);
}

// ---------------------------------------------------------------------------
// Phase 3 boundary — `{ error: "invalid_request", issues }` shape.
//
// A handful of newer public routes (bike-share, plan, kapnos, etc.) return a
// slightly different failure envelope than `badRequest` above: a stable
// `error` code plus a machine-readable `issues` array (one entry per Zod
// issue, not capped) so mobile clients can highlight the exact bad field.
// Kept separate from `badRequest`/`parseJsonBody` so existing routes using
// that older shape are untouched.

/** Format a ZodError as `{ path, message }` pairs for the client. */
export function invalidRequestIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/** 400 response using the `{ error: "invalid_request", issues }` envelope. */
export function invalidRequest(error: z.ZodError, headers: Headers_ = {}): Response {
  return Response.json(
    { error: "invalid_request", issues: invalidRequestIssues(error) },
    { status: 400, headers },
  );
}

/** Run a schema over an already-decoded value, using the `invalid_request` envelope. */
export function parseInput<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  headers: Headers_ = {},
): Parsed<z.infer<S>> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, response: invalidRequest(result.error, headers) };
}

/** Read + validate a JSON request body with the `invalid_request` envelope. */
export async function parseJsonInput<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  headers: Headers_ = {},
): Promise<Parsed<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        {
          error: "invalid_request",
          issues: [{ path: "", message: "expected valid JSON" }],
        },
        { status: 400, headers },
      ),
    };
  }
  return parseInput(schema, raw, headers);
}

/** Validate query parameters with the `invalid_request` envelope. */
export function parseQueryInput<S extends z.ZodTypeAny>(
  input: URL | URLSearchParams | string,
  schema: S,
  headers: Headers_ = {},
): Parsed<z.infer<S>> {
  const params =
    input instanceof URLSearchParams
      ? input
      : input instanceof URL
        ? input.searchParams
        : new URL(input).searchParams;
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) record[key] = value;
  return parseInput(schema, record, headers);
}
