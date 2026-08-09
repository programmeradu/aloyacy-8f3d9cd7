// Request-scoped storage shared by the vitest stand-ins for
// `@tanstack/react-start` and `@tanstack/react-start/server`.
//
// Production keeps the in-flight `Request` in an AsyncLocalStorage owned by the
// Start runtime, which unit tests never boot. The shim populates this store
// around every server-function call so `getRequest()` behaves exactly as it
// does in a real request — including returning the headers a test supplied.
import { AsyncLocalStorage } from "node:async_hooks";

export const testRequestStorage = new AsyncLocalStorage<Request>();

export function runWithTestRequest<T>(request: Request, fn: () => T): T {
  return testRequestStorage.run(request, fn);
}

export function getTestRequest(): Request | undefined {
  return testRequestStorage.getStore();
}
