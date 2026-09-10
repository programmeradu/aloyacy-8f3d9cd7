// Small server-side resilience helpers.
//
// Two problems this solves, both observed in production:
//   1. Every planner call re-fetched the whole realtime snapshot, so two
//      riders (or one rider and the map) paid the same cost twice.
//   2. When the database is degraded, a single auxiliary read can hang for
//      many seconds. None of those reads are load-bearing — they refine
//      ranking — so they must never hold the whole answer hostage.

type Entry<T> = { value: T; at: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Memoise an async producer for `ttlMs`, de-duplicating concurrent callers.
 * On failure the last good value is served (stale) rather than throwing,
 * because a stale bus feed beats a blank screen.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && now - hit.at < ttlMs) return hit.value;

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const p = fn()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((err: unknown) => {
      if (hit) return hit.value;
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}

/** Resolve with `fallback` when `p` takes longer than `ms` (or rejects). */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Test seam: drop everything memoised so suites do not leak state. */
export function clearServerCache(): void {
  store.clear();
  inflight.clear();
}
