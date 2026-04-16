// Native one-shot trip alerts. Mirrors web `sendTripAlert` semantics but
// fires LOCAL notifications via expo-notifications — the rider's phone is
// always foreground/background-active during a live trip, so we don't need
// to round-trip through the Expo Push Service for these in-flight nudges.
// (Pre-departure and missed-bus alerts still arrive via the server push
//  channel registered in `mobile/lib/push.ts`.)
//
// One-shot guarantees: callers use `useJourney`'s sentRef to dedupe per
// phase transition, so this helper never tries to throttle on its own.

import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type TripAlertKind =
  | "hurry-soft"
  | "hurry-urgent"
  | "at-stop"
  | "confirm-onboard"
  | "missed-bus"
  | "press-stop"
  | "arrived";

export type TripAlertPayload = {
  kind: TripAlertKind;
  routeShort?: string;
  stopName?: string;
  minutes?: number;
  /** Deep-link route (e.g. `/trip/<id>`) — included in notification data. */
  url?: string;
};

const COPY: Record<
  TripAlertKind,
  (p: TripAlertPayload) => { title: string; body: string }
> = {
  "hurry-soft": (p) => ({
    title: `Bus ${p.routeShort ?? ""} arriving soon`,
    body: `${minutesText(p.minutes)} to ${p.stopName ?? "your stop"}. Pick up the pace.`,
  }),
  "hurry-urgent": (p) => ({
    title: `Run — bus ${p.routeShort ?? ""} is almost here`,
    body: `${minutesText(p.minutes)} to ${p.stopName ?? "your stop"}. Move now.`,
  }),
  "at-stop": (p) => ({
    title: `You're at ${p.stopName ?? "the stop"}`,
    body: `Bus ${p.routeShort ?? ""} in ${minutesText(p.minutes)}.`,
  }),
  "confirm-onboard": (p) => ({
    title: `On board bus ${p.routeShort ?? ""}?`,
    body: "Tap to confirm so we can guide you to your stop.",
  }),
  "missed-bus": (p) => ({
    title: `Missed bus ${p.routeShort ?? ""}`,
    body: `Looks like you missed it at ${p.stopName ?? "your stop"}. Replanning options inside.`,
  }),
  "press-stop": (p) => ({
    title: `Press stop for ${p.stopName ?? "your stop"}`,
    body: `Your stop on bus ${p.routeShort ?? ""} is next.`,
  }),
  arrived: () => ({
    title: "You've arrived",
    body: "Trip complete. Have a great one.",
  }),
};

function minutesText(min?: number): string {
  if (min == null || min <= 0) return "less than a minute";
  if (min === 1) return "1 minute";
  return `${min} minutes`;
}

const HAPTIC: Record<TripAlertKind, () => Promise<void>> = {
  "hurry-soft": () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  "hurry-urgent": () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  "at-stop": () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  "confirm-onboard": () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  "missed-bus": () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  "press-stop": () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  arrived: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

/** Fire a local in-flight trip alert. Safe to call from useEffect — caller
 *  is responsible for one-shot dedupe per phase transition. */
export async function sendLocalTripAlert(payload: TripAlertPayload): Promise<void> {
  const { title, body } = COPY[payload.kind](payload);

  // Haptic first — instant feedback even before the notification panel renders.
  try {
    await HAPTIC[payload.kind]();
  } catch {
    // Haptics unavailable (simulator, low-end Android) — no-op.
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { url: payload.url, kind: payload.kind },
        sound: "default",
        ...(Platform.OS === "android"
          ? { channelId: "trip-alerts" }
          : {}),
      },
      trigger: null, // fire immediately
    });
  } catch {
    // Notification rights may have been revoked mid-trip; silently ignore.
  }
}
