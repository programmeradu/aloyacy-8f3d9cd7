// Vitest-only stand-in for `@tanstack/react-start`.
//
// In production the Start Vite plugin rewrites every `createServerFn(...)
// .handler(fn)` call into a client stub plus an extracted server handler. Unit
// tests run without that transform, so the real implementation has no server
// handler to invoke and silently resolves `undefined`. This shim keeps the same
// authoring API but executes the validator, the function middleware chain and
// the handler in-process, which is exactly what a unit test wants: real code,
// no transport.
//
// Everything else is re-exported from the real package.
export * from "@tanstack/react-start";

type AnyFn = (...args: unknown[]) => unknown;

type MiddlewareEntry = {
  options?: {
    server?: AnyFn;
    middleware?: MiddlewareEntry[];
  };
};

type CallOpts = {
  data?: unknown;
  context?: Record<string, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  request?: Request;
};

function flatten(list: MiddlewareEntry[] | undefined): MiddlewareEntry[] {
  const out: MiddlewareEntry[] = [];
  for (const m of list ?? []) {
    if (m?.options?.middleware) out.push(...flatten(m.options.middleware));
    out.push(m);
  }
  return out;
}

export function createServerFn(config?: { method?: string }) {
  const state: {
    method: string;
    middleware: MiddlewareEntry[];
    validator?: (input: unknown) => unknown;
  } = { method: config?.method ?? "POST", middleware: [] };

  const builder = {
    middleware(list: MiddlewareEntry[]) {
      state.middleware = [...state.middleware, ...list];
      return builder;
    },
    validator(fn: (input: unknown) => unknown) {
      state.validator = fn;
      return builder;
    },
    inputValidator(fn: (input: unknown) => unknown) {
      state.validator = fn;
      return builder;
    },
    handler(handlerFn: (ctx: Record<string, unknown>) => unknown) {
      const call = async (opts: CallOpts = {}) => {
        const data = state.validator ? await state.validator(opts.data) : opts.data;
        const request =
          opts.request ??
          new Request("http://localhost:8080/_serverFn", {
            method: state.method === "GET" ? "GET" : "POST",
            headers: opts.headers,
          });

        const chain = flatten(state.middleware);

        const run = async (
          index: number,
          context: Record<string, unknown>,
        ): Promise<unknown> => {
          const entry = chain[index];
          if (!entry?.options?.server) {
            return handlerFn({ data, context, request, method: state.method, signal: opts.signal });
          }
          let outcome: unknown;
          await entry.options.server({
            data,
            context,
            request,
            method: state.method,
            signal: opts.signal,
            next: async (patch?: { context?: Record<string, unknown> }) => {
              outcome = await run(index + 1, { ...context, ...(patch?.context ?? {}) });
              return { context: { ...context, ...(patch?.context ?? {}) }, result: outcome };
            },
          });
          return outcome;
        };

        return run(0, { ...(opts.context ?? {}) });
      };

      // Mirror the shape the real factory exposes so helpers can detect it.
      return Object.assign(call, {
        method: state.method,
        __executeServer: async (o: CallOpts) => ({ result: await call(o) }),
      });
    },
  };

  return builder;
}
