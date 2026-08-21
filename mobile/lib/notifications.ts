// Single safe entry point for `expo-notifications`.
//
// The module was previously stubbed out (`const Notifications: any = null`)
// across three call sites, which turned every notification code path into a
// TypeError. It is stubbed because `expo-notifications` throws on import in
// Expo Go on Android (SDK 53+) and is unavailable on web. Instead of nulling
// it, we resolve it lazily and degrade honestly: callers get `null` and can
// surface an "unsupported" state rather than crashing.

import { Platform } from "react-native";
import Constants from "expo-constants";

export type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;
let handlerSet = false;

/** True when the current runtime cannot host expo-notifications at all. */
export function notificationsUnsupportedReason(): string | null {
  if (Platform.OS === "web") return "Push isn't available in the browser build.";
  if (Platform.OS === "android" && Constants.appOwnership === "expo") {
    return "Notifications need a development build on Android (not Expo Go).";
  }
  return null;
}

/**
 * Returns the expo-notifications module, or null when it can't be used.
 * Never throws.
 */
export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (notificationsUnsupportedReason()) {
    cached = null;
    return cached;
  }
  try {
    // Lazy require keeps the import out of unsupported runtimes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-notifications") as NotificationsModule;
    cached = mod ?? null;
  } catch {
    cached = null;
  }

  if (cached && !handlerSet) {
    handlerSet = true;
    try {
      cached.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowAlert: true,
        }),
      });
    } catch {
      // handler is a nicety, not a requirement
    }
  }
  return cached;
}

export type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

export async function getNotificationPermission(): Promise<PermissionState> {
  const N = getNotifications();
  if (!N) return "unsupported";
  try {
    const settings = await N.getPermissionsAsync();
    if (settings.status === "granted") return "granted";
    if (settings.status === "denied" && !settings.canAskAgain) return "denied";
    return settings.status === "denied" ? "denied" : "undetermined";
  } catch {
    return "unsupported";
  }
}

export async function requestNotificationPermissionState(): Promise<PermissionState> {
  const N = getNotifications();
  if (!N) return "unsupported";
  try {
    const current = await N.getPermissionsAsync();
    if (current.status === "granted") return "granted";
    if (!current.canAskAgain) return "denied";
    const req = await N.requestPermissionsAsync();
    return req.status === "granted" ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/** Android needs an explicit high-importance channel for trip alerts. */
export async function ensureTripAlertChannel(): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS !== "android") return;
  try {
    await N.setNotificationChannelAsync("trip-alerts", {
      name: "Trip alerts",
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#3A7B8A",
      sound: "default",
    });
  } catch {
    // channel creation failure shouldn't block scheduling
  }
}
