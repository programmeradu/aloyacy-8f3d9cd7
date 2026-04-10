// Native push registration for the Aloya rider app.
//
// Asks the OS for permission, fetches the Expo push token, then mirrors it
// to the backend via /api/public/expo-push-register. The server-side trip
// alert scheduler dispatches via the Expo Push Service.

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { API_BASE } from "./api";

const DEVICE_ID_KEY = "aloya.deviceId.v1";
const LAST_TOKEN_KEY = "aloya.expoPushToken.v1";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("trip-alerts", {
    name: "Trip alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: "#3A7B8A",
    sound: "default",
  });
}

export type RegisterResult =
  | { ok: true; token: string; deviceId: string }
  | { ok: false; reason: "unsupported" | "denied" | "no-project-id" | "error"; message?: string };

export async function registerForPushNotifications(): Promise<RegisterResult> {
  if (!Device.isDevice) return { ok: false, reason: "unsupported" };

  await ensureAndroidChannel();

  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return { ok: false, reason: "denied" };

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: "no-project-id" };

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
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
      return { ok: false, reason: "error", message: `Register ${res.status}` };
    }
    await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
    return { ok: true, token, deviceId };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
