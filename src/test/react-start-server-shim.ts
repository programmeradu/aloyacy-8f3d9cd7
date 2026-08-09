// Vitest-only stand-in for `@tanstack/react-start/server`.
//
// The real `getRequest()` reads the Start runtime's request storage, which only
// exists inside a served request. Tests call server functions directly, so we
// resolve the request from the shim's own storage instead and fall back to the
// genuine implementation when a test runs inside a real Start context.
export * from "@tanstack/react-start/server";

import { getRequest as realGetRequest } from "@tanstack/react-start/server";
import { getTestRequest } from "./start-request-context";

export function getRequest(): Request {
  const fromTest = getTestRequest();
  if (fromTest) return fromTest;
  return realGetRequest();
}
