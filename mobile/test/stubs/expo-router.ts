// Navigation stub: records intents so tests can assert on them without a
// mounted navigator.

const calls: Array<{ type: "push" | "replace" | "back"; href?: unknown }> = [];

export const router = {
  push(href: unknown) {
    calls.push({ type: "push", href });
  },
  replace(href: unknown) {
    calls.push({ type: "replace", href });
  },
  back() {
    calls.push({ type: "back" });
  },
  __calls: calls,
};

export function useRouter() {
  return router;
}

export function useLocalSearchParams<T = Record<string, string>>(): T {
  return {} as T;
}

export function usePathname(): string {
  return "/";
}

export function __resetRouter() {
  calls.length = 0;
}
