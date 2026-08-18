// Offline guarantee, enforced rather than documented.
//
// The suite must run from a fresh clone on a machine with no credentials and
// no network. Any test that reaches a real host is a test that will go red in
// someone else's CI, so the escape hatches are closed here: `fetch` and the
// Node HTTP clients throw a loud, attributable error instead of opening a
// socket. Tests that exercise HTTP behaviour replace `fetch` themselves with
// `vi.fn()` / `vi.stubGlobal`, which shadows this guard for that test only.

import { beforeEach } from "vitest";

const message = (target: string) =>
  new Error(
    `Blocked network access to ${target}. Tests must run offline — ` +
      `stub the call with vi.fn()/vi.stubGlobal("fetch", ...) or inject a fake fetcher.`,
  );

function describeTarget(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && "url" in input) return String(input.url);
  return "an external host";
}

const blockedFetch = (async (input: unknown) => {
  throw message(describeTarget(input));
}) as unknown as typeof fetch;

function installFetchGuard() {
  globalThis.fetch = blockedFetch;
}

installFetchGuard();

// A test that stubs `fetch` and forgets to restore it must not leave the next
// test with a live socket, so the guard is reinstated before every test unless
// the current test deliberately replaced it.
beforeEach(() => {
  if (globalThis.fetch !== blockedFetch && !("mock" in (globalThis.fetch as object))) {
    installFetchGuard();
  }
});

for (const mod of ["node:http", "node:https"] as const) {
  import(mod)
    .then((http) => {
      const block = (...args: unknown[]) => {
        throw message(describeTarget(args[0]));
      };
      Object.assign(http.default, { request: block, get: block });
    })
    .catch(() => {
      /* module unavailable in this environment — nothing to guard */
    });
}
