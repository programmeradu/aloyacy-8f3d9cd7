/** Records navigation instead of performing it, so callers can assert on it. */
export const navigations: Array<{ method: string; target: unknown }> = [];

export const router = {
  push: (target: unknown) => navigations.push({ method: "push", target }),
  replace: (target: unknown) => navigations.push({ method: "replace", target }),
  navigate: (target: unknown) => navigations.push({ method: "navigate", target }),
  back: () => navigations.push({ method: "back", target: null }),
  canGoBack: () => navigations.length > 0,
  setParams: (target: unknown) => navigations.push({ method: "setParams", target }),
};

export function __resetNavigations() {
  navigations.length = 0;
}
