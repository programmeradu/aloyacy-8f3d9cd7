// Service worker registration + push subscription helpers.
// Guards against the Lovable preview iframe so the SW never caches the
// preview shell during editing.

import { VAPID_PUBLIC_KEY } from "./vapid";

export function shouldRegisterSW(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  // Skip inside any iframe (Lovable preview, embeds, etc.)
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  // Skip on Lovable preview hosts
  const host = window.location.hostname;
  if (host.includes("id-preview--")) return false;
  if (host.includes("lovableproject.com")) return false;
  if (host.includes("lovable.dev")) return false;
  return true;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegisterSW()) {
    // Clean up any SW that may have been registered on this host previously.
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      regs?.forEach((r) => r.unregister());
    } catch {}
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("[pwa] SW register failed", err);
    return null;
  }
}

// ---------- device id ----------
const DEVICE_KEY = "aloya:device-id";
const DEVICE_TOKEN_KEY = "aloya:device-token";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Bearer token bound to this device. Issued once on first call; cached
 *  in localStorage thereafter. Returns null if the device was already
 *  claimed elsewhere (e.g. localStorage cleared) — callers should treat
 *  history reads/writes as unavailable in that case. */
let tokenInflight: Promise<string | null> | null = null;
export async function getDeviceToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const cached = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (cached) return cached;
  if (tokenInflight) return tokenInflight;
  tokenInflight = (async () => {
    try {
      const { claimDeviceToken } = await import("./suggestions.functions");
      const res = await claimDeviceToken({ data: { deviceId: getDeviceId() } });
      if (res.ok) {
        localStorage.setItem(DEVICE_TOKEN_KEY, res.token);
        return res.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      tokenInflight = null;
    }
  })();
  return tokenInflight;
}

/** Current Supabase access token, if signed in. Used to scope trip history
 *  to the user so it follows them across devices. */
export async function getAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// ---------- push subscription ----------
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type SerializedSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function serializeSubscription(sub: PushSubscription): SerializedSubscription {
  return {
    endpoint: sub.endpoint,
    p256dh: bufToB64Url(sub.getKey("p256dh")),
    auth: bufToB64Url(sub.getKey("auth")),
  };
}

export async function getOrCreatePushSubscription(): Promise<
  { ok: true; subscription: SerializedSubscription } | { ok: false; reason: string }
> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "Service workers are not supported in this browser." };
  }
  if (!("PushManager" in window)) {
    return { ok: false, reason: "Push notifications are not supported here." };
  }
  if (!shouldRegisterSW()) {
    return {
      ok: false,
      reason:
        "Notifications only work on the installed app. Open the published site (or add Aloya to your home screen) and try again.",
    };
  }

  const reg =
    (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  if (!reg) return { ok: false, reason: "Service worker not available." };
  await navigator.serviceWorker.ready;

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Permission denied." };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return { ok: true, subscription: serializeSubscription(sub) };
}

export async function unsubscribePush(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe();
    return true;
  }
  return false;
}
