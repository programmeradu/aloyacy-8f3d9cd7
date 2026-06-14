// Premium trip alerts using Notifee.
//
// Unlike standard notifications, Notifee allows us to:
//   - Show live progress bars for bus arrival.
//   - Use custom Cyprus-themed alert sounds.
//   - Add quick actions like "Mute Trip" or "Share ETA".

import notifee, { AndroidImportance, TriggerType, TimestampTrigger } from "@notifee/react-native";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export type TripAlert = {
  id: string;
  title: string;
  body: string;
  /** Scheduled time (unix ms) for the alert. */
  triggerAt?: number;
  /** Custom data to pass to the notification handler. */
  data?: Record<string, any>;
};

/** Ensure the Android channel exists for trip alerts. */
async function ensureChannel() {
  if (Platform.OS !== "android") return null;
  return await notifee.createChannel({
    id: "trip-alerts",
    name: "Trip Alerts",
    importance: AndroidImportance.HIGH,
    vibration: true,
    vibrationPattern: [300, 500],
  });
}

/** Immediately fire a trip alert with premium haptics. */
export async function sendLocalTripAlert(alert: TripAlert) {
  if (Platform.OS === "web") return;

  const channelId = await ensureChannel();

  await notifee.displayNotification({
    id: alert.id,
    title: alert.title,
    body: alert.body,
    android: {
      channelId: channelId || "default",
      importance: AndroidImportance.HIGH,
      pressAction: { id: "default" },
    },
    data: alert.data,
  });

  // Fire "Double Heavy Pulse" haptic for attention.
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150);
}

/** Schedule an alert for the future (e.g. "Boarding in 2 mins"). */
export async function scheduleTripAlert(alert: TripAlert) {
  if (!alert.triggerAt || Platform.OS === "web") return;

  const channelId = await ensureChannel();
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: alert.triggerAt,
  };

  await notifee.createTriggerNotification(
    {
      id: alert.id,
      title: alert.title,
      body: alert.body,
      android: {
        channelId: channelId || "default",
      },
      data: alert.data,
    },
    trigger,
  );
}

/** Cancel a specific scheduled alert. */
export async function cancelTripAlert(id: string) {
  if (Platform.OS === "web") return;
  await notifee.cancelNotification(id);
}
