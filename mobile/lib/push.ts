// Native push registration for the Aloya rider app.
//
// Asks the OS for permission, fetches the Expo push token, then mirrors it to
// the backend via /api/public/expo-push-register so the server-side trip alert
// scheduler (pre-departure and missed-bus alerts) can target the device.

import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { API_BASE } from "./api";
import {
  ensureTripAlertChannel,
  getNotifications,
  notificationsUnsupportedReason,
  requestNotificationPermissionState,
} from "./notifications";

const DEVICE_ID_KEY = "aloya.deviceId.v1";
const LAST_TOKEN_KEY = "aloya.expoPushToken.v1";

function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const fresh = randomId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  return fresh;
}

export type RegisterResult =
  | { ok: true; token: string; deviceId: string }
  | { ok: false; reason: "unsupported" | "denied" | "no-project-id" | "error"; message?: string };

export async function requestNotificationPermission(): Promise<boolean> {
  return (await requestNotificationPermissionState()) === "granted";
}

export async function registerForPushNotifications(): Promise<RegisterResult> {
  if (Platform.OS === "web") return { ok: false, reason: "unsupported" };
  if (!Device.isDevice) {
    return { ok: false, reason: "unsupported", message: "Push needs a physical device." };
  }
  const blocked = notificationsUnsupportedReason();
  if (blocked) return { ok: false, reason: "unsupported", message: blocked };

  const N = getNotifications();
  if (!N) return { ok: false, reason: "unsupported" };

  await ensureTripAlertChannel();

  const permission = await requestNotificationPermissionState();
  if (permission === "unsupported") return { ok: false, reason: "unsupported" };
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const projectId =
    (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } })?.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: "no-project-id" };

  try {
    const tokenResponse = await N.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    const deviceId = await getOrCreateDeviceId();

    // Skip the network round-trip when the token has not changed.
    const cached = await AsyncStorage.getItem(LAST_TOKEN_KEY);
    if (cached === token) return { ok: true, token, deviceId };

    const res = await fetch(`${API_BASE}/api/public/expo-push-register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        expoToken: token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        appVersion: Constants?.expoConfig?.version,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: "error", message: `Register failed (${res.status})` };
    }
    await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
    return { ok: true, token, deviceId };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function registerTripForVoiceAssistant(trip: {
  routeShort: string;
  stopName: string;
  destinationName: string;
}) {
  if (Platform.OS === "web") return;
  console.log("[VoiceAssistant] Registering trip", trip);
}
