// Stable per-device identifier used to enforce once-per-device free trials.
// localStorage-scoped so it survives navigation but is easy to inspect.
// Not a security boundary — server pairs it with user_id for real enforcement.

const KEY = "aloya:device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id =
        (crypto.randomUUID?.() as string | undefined) ??
        `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}
