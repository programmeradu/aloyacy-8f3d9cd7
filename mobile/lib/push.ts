// Native push registration for the Aloya rider app.
// Uses @notifee/react-native for premium local alerts and
// Expo/Firebase for remote push tokens.

import notifee, { AuthorizationStatus } from "@notifee/react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { API_BASE } from "./api";

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
  if (Platform.OS === "web") return false;
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

export async function registerForPushNotifications(): Promise<RegisterResult> {
  if (Platform.OS === "web") return { ok: false, reason: "unsupported" };
  if (!Device.isDevice) return { ok: false, reason: "unsupported" };

  const granted = await requestNotificationPermission();
  if (!granted) return { ok: false, reason: "denied" };

  // Note: For real remote tokens with Notifee, we usually use @react-native-firebase/messaging.
  // In this dev build, we will start with local alerts and move to RNFirebase for remote.
  return { ok: true, token: "local-only", deviceId: await getOrCreateDeviceId() };
}

export async function registerTripForVoiceAssistant(trip: {
  routeShort: string;
  stopName: string;
  destinationName: string;
}) {
  if (Platform.OS === "web") return;
  console.log("[VoiceAssistant] Registering trip", trip);
}
