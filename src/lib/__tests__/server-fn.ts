// Test helper: invoke a `createServerFn` server function without booting the
// Start runtime.
//
// Two things stand in the way of calling one directly in a unit test:
//   1. TanStack reads request-scoped state from an AsyncLocalStorage store, so
//      we supply a minimal one instead of running a real request.
//   2. Calling the exported function takes the *client* path, which expects a
//      transport round trip. `__executeServer` is the server-side entry point
//      the RPC layer itself uses: it runs the input validator, the middleware
//      chain, and the handler, and hands back `{ result, error }`.
import { runWithStartContext } from "@tanstack/start-storage-context";

type ServerFnLike<TData, TResult> = {
  __executeServer: (opts: {
    data: TData;
    context?: Record<string, unknown>;
    method?: string;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    request?: Request;
  }) => Promise<{ result: TResult; error?: unknown }>;
  method?: string;
};

export type CallServerFnInit = {
  /** Request URL the handler sees via the Start context. */
  url?: string;
  /** Request headers, e.g. an Authorization bearer for auth middleware. */
  headers?: Record<string, string>;
  /** Context seeded as if produced by global request middleware. */
  context?: Record<string, unknown>;
  signal?: AbortSignal;
};

/**
 * Run a server function's handler and return its resolved value.
 * Validator failures and handler throws reject, matching production.
 */
export async function callServerFn<TResult>(
  // The input side is deliberately loose. A `createServerFn` fetcher's data
  // type comes from its validator's *output*, which is often narrower than
  // what a caller legitimately sends (branded unions, coerced numbers,
  // defaulted fields). Tests must be able to hand in the raw payload the RPC
  // layer would receive — including invalid ones, to assert the validator
  // rejects them — so the type is not pinned here; the validator is what
  // enforces it at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: ServerFnLike<any, TResult> | ((opts: { data: any }) => Promise<TResult>),
  data: unknown,
  init: CallServerFnInit = {},
): Promise<TResult> {
  const target = fn as ServerFnLike<unknown, TResult>;
  if (typeof target.__executeServer !== "function") {
    // Plain async function (already-unwrapped handler) — call it as-is.
    return (fn as (opts: { data: unknown }) => Promise<TResult>)({ data });
  }


  const request = new Request(init.url ?? "http://localhost:8080/_serverFn", {
    method: "POST",
    headers: init.headers,
  });

  const outcome = await runWithStartContext(
    {
      getRouter: () => ({}) as never,
      request,
      startOptions: {},
      contextAfterGlobalMiddlewares: init.context ?? {},
      executedRequestMiddlewares: new Set(),
      handlerType: "serverFn",
    },
    () =>
      target.__executeServer({
        data,
        context: init.context ?? {},
        method: target.method ?? "POST",
        headers: init.headers,
        request,
        ...(init.signal ? { signal: init.signal } : {}),
      }),
  );

  if (outcome.error) throw outcome.error;
  return outcome.result;
}
