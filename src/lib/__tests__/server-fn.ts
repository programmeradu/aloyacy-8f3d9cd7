// Test helper: invoke a `createServerFn` server function outside the Start
// runtime. TanStack reads request-scoped state from an AsyncLocalStorage
// store, so we supply a minimal one instead of booting a server.
import { runWithStartContext } from "@tanstack/start-storage-context";

type ServerFn<TData, TResult> = (opts: { data: TData }) => Promise<TResult>;

export function callServerFn<TData, TResult>(
  fn: ServerFn<TData, TResult>,
  data: TData,
  init?: { url?: string; headers?: Record<string, string> },
): Promise<TResult> {
  const request = new Request(init?.url ?? "http://localhost:8080/_serverFn", {
    method: "POST",
    headers: init?.headers,
  });
  return runWithStartContext(
    {
      getRouter: () => ({}) as never,
      request,
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: "serverFn",
    },
    () => fn({ data }),
  );
}
