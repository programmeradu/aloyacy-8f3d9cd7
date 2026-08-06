// Test-only helper for calling API route handlers directly.
//
// TanStack types `server.handlers` as either a record or a factory function,
// so reading `.GET` off the union does not typecheck. Route handlers are the
// unit under test here, and going through a real HTTP server would make the
// suite slow and flaky — so we narrow the shape in one place instead of
// scattering casts across every route test.

type Handler = (ctx: { request: Request }) => Response | Promise<Response>;

type AnyRoute = { options?: unknown };

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

/** Pull a single method handler off a generated file route. */
export function getHandler(route: AnyRoute, method: HttpMethod): Handler {
  const options = route.options as
    { server?: { handlers?: Partial<Record<HttpMethod, Handler>> } } | undefined;
  const handler = options?.server?.handlers?.[method];
  if (typeof handler !== "function") {
    throw new Error(`route has no ${method} handler`);
  }
  return handler;
}

/** Convenience: build a Request for a public API path with query params. */
export function apiRequest(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
): Request {
  const { query, ...rest } = init;
  const url = new URL(path, "https://app.aloya.cy");
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return new Request(url, rest);
}
