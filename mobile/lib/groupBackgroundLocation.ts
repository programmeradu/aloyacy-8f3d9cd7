// Background location for group trips. Uses TaskManager +
// Location.startLocationUpdatesAsync so the rider's dot keeps updating for
// the group when the screen is off or the app is backgrounded.
//
// Ownership: only one group can ping in the background at a time (the last
// one joined). Starting a new session replaces the previous one.

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";

export const GROUP_LOCATION_TASK = "aloya-group-location";
const ACTIVE_KEY = "aloya.group.bgToken";
const CODE_KEY = "aloya.group.bgCode";
const MIN_INTERVAL_MS = 25_000;
let lastPingAt = 0;

TaskManager.defineTask(GROUP_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const now = Date.now();
  if (now - lastPingAt < MIN_INTERVAL_MS) return;
  const locations = (data as { locations?: Location.LocationObject[] })?.locations;
  const loc = locations?.[locations.length - 1];
  if (!loc) return;
  const token = await AsyncStorage.getItem(ACTIVE_KEY);
  if (!token) return;
  lastPingAt = now;
  try {
    const res = await fetch(`${API_BASE}/api/public/trip-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ping",
        payload: {
          memberToken: token,
          position: { lat: loc.coords.latitude, lng: loc.coords.longitude },
        },
      }),
    });
    // If group has ended, stop pinging.
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (j && j.ok === false && j.reason === "expired") {
        await stopGroupBackgroundLocation();
      }
    }
  } catch {
    // Swallow — will retry on next OS location callback.
  }
});

export async function startGroupBackgroundLocation(memberToken: string, code: string) {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== "granted") return;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") return;
    await AsyncStorage.setItem(ACTIVE_KEY, memberToken);
    await AsyncStorage.setItem(CODE_KEY, code);
    const running = await Location.hasStartedLocationUpdatesAsync(GROUP_LOCATION_TASK);
    if (running) {
      await Location.stopLocationUpdatesAsync(GROUP_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(GROUP_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 25_000,
      distanceInterval: 30,
      showsBackgroundLocationIndicator: false,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "Aloya group trip",
        notificationBody: "Sharing your live position with the group.",
      },
    });
  } catch {
    // Not available on web / unsupported platforms — foreground pings still run.
  }
}

export async function stopGroupBackgroundLocation() {
  try {
    await AsyncStorage.multiRemove([ACTIVE_KEY, CODE_KEY]);
    const running = await Location.hasStartedLocationUpdatesAsync(GROUP_LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(GROUP_LOCATION_TASK);
  } catch {
    // ignore
  }
}
